// Fills in cover URLs for issues the Marvel-native enricher couldn't resolve.
// Uses ComicVine's public search — rate limited to ~200 req/hour per endpoint.
// Batches per series: one volume lookup returns all its issues' covers in 1-2 calls.
//
// API key lives in env CV_API_KEY (never commit). Usage:
//   CV_API_KEY=xxx npx tsx enrich-from-comicvine.ts

import { readFile, writeFile } from 'node:fs/promises';
import type { EventsFile, Issue } from '../pwa/src/lib/schema';

const CV_API_KEY = process.env.CV_API_KEY;
if (!CV_API_KEY) { console.error('CV_API_KEY not set'); process.exit(1); }

const CV_BASE = 'https://comicvine.gamespot.com/api';
const UA = 'marvel-reading-guide/1.0';
const EVENTS_PATH = new URL('../pwa/src/data/events.json', import.meta.url);

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface CvImage { original_url: string; medium_url: string; small_url: string }
interface CvIssue {
  id: number;
  issue_number: string;
  cover_date?: string;
  image: CvImage | null;
  volume: { id: number; name: string; publisher?: { name?: string } };
  site_detail_url?: string;
}

async function cv<T>(path: string): Promise<T> {
  const url = `${CV_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${CV_API_KEY}&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 420 || res.status === 429) {
    console.warn('  rate-limited, sleeping 90s…');
    await sleep(90_000);
    return cv<T>(path);
  }
  if (!res.ok) throw new Error(`CV ${res.status} on ${path}`);
  return res.json();
}

// Group issues that still need covers by their series title.
function groupUnmatched(file: EventsFile): Map<string, Issue[]> {
  const map = new Map<string, Issue[]>();
  for (const ev of file.events) {
    for (const iss of ev.issues) {
      if (iss.cover) continue;
      const key = iss.title;
      const list = map.get(key) ?? [];
      list.push(iss);
      map.set(key, list);
    }
  }
  return map;
}

interface CvVolumeHit { id: number; name: string; startYear?: number }

async function findAllVolumes(title: string): Promise<CvVolumeHit[]> {
  // Returns ALL Marvel volumes whose name matches the input title (after normalization).
  // Needed because titles like "Uncanny X-Men" have multiple volumes we care about.
  const q = encodeURIComponent(title);
  const data: { results: Array<{ id: number; name: string; start_year?: string; publisher?: { name?: string } }> } =
    await cv(`/volumes/?filter=name:${q}&field_list=id,name,start_year,publisher&limit=50`);
  // Equivalence classes: "the " prefix removed; " and " ↔ " & "; " - " ↔ ":"; case-insensitive.
  const normalized = (s: string) =>
    s.toLowerCase().trim()
      .replace(/^the\s+/, '')
      .replace(/\s+&\s+/g, ' and ')
      .replace(/\s*:\s*/g, ' ')
      .replace(/\s+-\s+/g, ' ')
      .replace(/\s+/g, ' ');
  const targetName = normalized(title);
  const spinoffRE = /\b(annual|giant[- ]size|collection|special|digital|magazine|omnibus|tpb|hardcover|treasury|saga|featuring|present|at\s+the)\b|\bby\s+\w|:\s|\s—\s|\(weekly/i;
  const hasSpinoffInInput = spinoffRE.test(title);

  return (data.results ?? [])
    .filter((v) => !v.publisher || /marvel/i.test(v.publisher.name ?? ''))
    .filter((v) => hasSpinoffInInput || !spinoffRE.test(v.name))
    .filter((v) => normalized(v.name) === targetName)
    .map((v) => ({
      id: v.id,
      name: v.name,
      startYear: v.start_year ? parseInt(v.start_year, 10) : undefined,
    }))
    .sort((a, b) => (a.startYear ?? 0) - (b.startYear ?? 0));
}

async function findVolume(title: string, hintedYear: number): Promise<CvVolumeHit | null> {
  // Searches CV's /volumes endpoint. Key selection rules:
  //  1. Reject obvious spin-offs (Annual, Giant-Size, :Subtitle, Collection, Special, Digital-Only)
  //     unless the input title itself has them.
  //  2. Prefer exact-name matches (case-insensitive).
  //  3. Within same score, prefer start_year closest to hintedYear.
  const q = encodeURIComponent(title);
  const data: { results: Array<{ id: number; name: string; start_year?: string; publisher?: { name?: string } }> } =
    await cv(`/volumes/?filter=name:${q}&field_list=id,name,start_year,publisher&limit=50`);
  const normalized = (s: string) => s.toLowerCase().trim().replace(/^the\s+/, '');
  const targetName = normalized(title);
  const spinoffRE = /\b(annual|giant[- ]size|collection|special|digital|magazine|omnibus|tpb|hardcover|treasury|saga|featuring|present|at\s+the)\b|\bby\s+\w|:\s|\s—\s|\(weekly/i;
  const hasSpinoffInInput = spinoffRE.test(title);

  const scored = (data.results ?? [])
    .filter((v) => !v.publisher || /marvel/i.test(v.publisher.name ?? ''))
    .filter((v) => hasSpinoffInInput || !spinoffRE.test(v.name))
    .map((v) => ({
      id: v.id,
      name: v.name,
      startYear: v.start_year ? parseInt(v.start_year, 10) : undefined,
      exact: normalized(v.name) === targetName,
      yearDist: Math.abs((v.start_year ? parseInt(v.start_year, 10) : 9999) - hintedYear),
    }))
    .sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      return a.yearDist - b.yearDist;
    });

  return scored[0] ?? null;
}

async function fetchVolumeIssues(volumeId: number): Promise<CvIssue[]> {
  // Pull all issues in this volume. CV paginates at 100 by default.
  const all: CvIssue[] = [];
  let offset = 0;
  for (let page = 0; page < 10; page++) {
    const data: { results: CvIssue[]; number_of_page_results: number; number_of_total_results: number } =
      await cv(`/issues/?filter=volume:${volumeId}&field_list=id,issue_number,cover_date,image,volume&limit=100&offset=${offset}`);
    all.push(...(data.results ?? []));
    offset += data.number_of_page_results;
    if (offset >= (data.number_of_total_results ?? 0)) break;
    await sleep(1500);
  }
  return all;
}

async function main() {
  const file: EventsFile = JSON.parse(await readFile(EVENTS_PATH, 'utf8'));
  const groups = groupUnmatched(file);
  const titles = [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);

  console.log(`${titles.length} unique series need covers (${[...groups.values()].reduce((s, x) => s + x.length, 0)} issues total)`);

  let saved = 0;
  const save = async () => {
    file.generatedAt = new Date().toISOString();
    await writeFile(EVENTS_PATH, JSON.stringify(file, null, 2));
    process.stdout.write(' 💾');
  };

  for (const title of titles) {
    const issues = groups.get(title)!;
    if (issues.length === 0) continue;
    try {
      const vols = await findAllVolumes(title);
      if (vols.length === 0) { console.log(` ✗ no volume for "${title}"`); await sleep(1500); continue; }
      console.log(`\n→ "${title}" (n=${issues.length}) → ${vols.length} volume(s): ${vols.map((v) => `${v.startYear ?? '?'}`).join(', ')}`);
      await sleep(1500);
      // Merge all CV issues from all volumes, keyed by number → candidates
      const candidates = new Map<number, CvIssue[]>();
      for (const vol of vols) {
        const cvIssues = await fetchVolumeIssues(vol.id);
        for (const ci of cvIssues) {
          const n = parseInt(ci.issue_number, 10);
          if (Number.isNaN(n)) continue;
          const list = candidates.get(n) ?? [];
          list.push(ci);
          candidates.set(n, list);
        }
        await sleep(1500);
      }
      let hits = 0;
      for (const iss of issues) {
        const list = candidates.get(iss.number);
        if (!list?.length) continue;
        // Pick the candidate whose cover_date year is closest to the issue's year
        const best = list.slice().sort((a, b) => {
          const aY = a.cover_date ? parseInt(a.cover_date.slice(0, 4), 10) : 9999;
          const bY = b.cover_date ? parseInt(b.cover_date.slice(0, 4), 10) : 9999;
          return Math.abs(aY - iss.year) - Math.abs(bY - iss.year);
        })[0];
        if (!best?.image?.original_url) continue;
        iss.cover = best.image.original_url;
        hits++;
      }
      console.log(`  ${hits}/${issues.length} covers added`);
      saved += hits;
      if (saved >= 25) { await save(); saved = 0; }
      await sleep(1500);
    } catch (err) {
      console.warn(`  err on "${title}": ${(err as Error).message}`);
      await sleep(5000);
    }
  }

  await save();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
