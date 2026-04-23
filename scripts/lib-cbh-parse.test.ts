import { describe, expect, it } from 'vitest';
import { parseIssueFragment, parseIssueLine, slugify } from './lib-cbh-parse.js';

describe('slugify', () => {
  it('lowercases + hyphenates', () => {
    expect(slugify('House of M')).toBe('house-of-m');
  });
  it('strips accents', () => {
    expect(slugify('X-Men: La Résurrection')).toBe('x-men-la-resurrection');
  });
  it('collapses punctuation', () => {
    expect(slugify("New X-Men!! #114??")).toBe('new-x-men-114');
  });
});

describe('parseIssueFragment', () => {
  it('parses "Title #N"', () => {
    const r = parseIssueFragment('New X-Men #114', 'core', 2001);
    expect(r).toEqual([
      { id: 'new-x-men-114', title: 'New X-Men', number: 114, year: 2001, role: 'core' },
    ]);
  });

  it('parses ranges "Title #N-M"', () => {
    const r = parseIssueFragment('Cable #5-8', 'core', 1993);
    expect(r.map((i) => i.number)).toEqual([5, 6, 7, 8]);
    expect(r.every((i) => i.title === 'Cable')).toBe(true);
  });

  it('parses " to " ranges after pre-transform (via parseIssueLine)', () => {
    // parseIssueFragment doesn't know about "to"; parseIssueLine normalises
    // inside Collects: lines. Direct fragment of "Cable #5 to 8" is NOT a
    // valid Marvel format so we don't support it here.
    const r = parseIssueFragment('Cable 5 to 8', 'core', 1993);
    expect(r).toEqual([]); // no # sign, fragment parser rejects
  });

  it('overrides default year with (YYYY) annotation', () => {
    const r = parseIssueFragment('X-Factor (1986) #84-85', 'core', 2020);
    expect(r[0].year).toBe(1986);
    expect(r[1].year).toBe(1986);
    expect(r[0].title).toBe('X-Factor');
  });

  it('strips TPB "Vol. N:" prefix', () => {
    const r = parseIssueFragment('Vol. 2: Wolverine #17', 'core', 1988);
    expect(r).toEqual([
      { id: 'wolverine-17', title: 'Wolverine', number: 17, year: 1988, role: 'core' },
    ]);
  });

  it('strips TPB "Volume N:" prefix', () => {
    const r = parseIssueFragment('Volume 1: X-Force #1', 'core', 1991);
    expect(r[0].title).toBe('X-Force');
  });

  it('rejects prose (starts with stop-words)', () => {
    expect(parseIssueFragment('She appeared in Uncanny X-Men #393', 'core', 2001)).toEqual([]);
    expect(parseIssueFragment('My thoughts on House of X #1', 'core', 2019)).toEqual([]);
  });

  it('rejects prose by title-length proxy', () => {
    // 8+ words before the # — clearly prose, not an issue ref
    const r = parseIssueFragment(
      'At one point or another everybody has read Uncanny X-Men #393',
      'core',
      2001,
    );
    expect(r).toEqual([]);
  });

  it('rejects review / essay keywords', () => {
    expect(parseIssueFragment('Highly recommend Uncanny X-Men #393', 'core', 2001)).toEqual([]);
  });

  it('rejects empty / whitespace', () => {
    expect(parseIssueFragment('', 'core', 2020)).toEqual([]);
    expect(parseIssueFragment('   ', 'core', 2020)).toEqual([]);
  });

  it('rejects absurd ranges (year-looks-like-range)', () => {
    // Guard: "#1986-2020" → 34-year range — not a valid issue range
    expect(parseIssueFragment('Uncanny X-Men #1986-2020', 'core', 2020)).toEqual([]);
  });
});

describe('parseIssueLine — plain', () => {
  it('routes plain fragments straight through', () => {
    const r = parseIssueLine('New X-Men #114', 'core', 2001);
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('New X-Men');
  });
});

describe('parseIssueLine — "Collects:" prefix', () => {
  it('parses single-fragment Collects line', () => {
    const r = parseIssueLine('Collects: Cable #5-14', 'core', 1993);
    expect(r).toHaveLength(10);
    expect(r.every((i) => i.title === 'Cable')).toBe(true);
  });

  it('splits comma-separated fragments', () => {
    const r = parseIssueLine(
      'Collects: New Mutants #87, Cable #1-4, Cable: Blood & Metal #1-2',
      'core',
      1990,
    );
    const titles = r.map((i) => `${i.title} #${i.number}`);
    expect(titles).toContain('New Mutants #87');
    expect(titles).toContain('Cable #1');
    expect(titles).toContain('Cable #4');
    expect(titles).toContain('Cable: Blood & Metal #1');
    expect(titles).toContain('Cable: Blood & Metal #2');
  });

  it('handles Collects (in order): variant', () => {
    const r = parseIssueLine(
      'Collects (in order): Uncanny X-Men #270, X-Factor #60',
      'core',
      1990,
    );
    expect(r.map((i) => `${i.title} #${i.number}`)).toEqual([
      'Uncanny X-Men #270',
      'X-Factor #60',
    ]);
  });

  it('recognises Includes: / Contains: prefixes', () => {
    const r1 = parseIssueLine('Includes: X-Men #1', 'core', 1991);
    expect(r1).toHaveLength(1);
    const r2 = parseIssueLine('Contains: X-Men #1', 'core', 1991);
    expect(r2).toHaveLength(1);
  });

  it('splits on " And " (case-insensitive)', () => {
    const r = parseIssueLine(
      'Collects: New Warriors #31 And X-Force #19-25',
      'core',
      1990,
    );
    const titles = r.map((i) => `${i.title} #${i.number}`);
    expect(titles).toContain('New Warriors #31');
    expect(titles).toContain('X-Force #19');
    expect(titles).toContain('X-Force #25');
    // Ensure nothing got "And" baked into the title
    expect(r.every((i) => !i.title.includes('And'))).toBe(true);
  });

  it('preserves per-fragment year from (YYYY) annotations', () => {
    const r = parseIssueLine(
      'Collects: Cable (1993) #15-16 And Wolverine (1988) #85',
      'core',
      2020,
    );
    const cableIssues = r.filter((i) => i.title === 'Cable');
    const wolvIssues = r.filter((i) => i.title === 'Wolverine');
    expect(cableIssues.every((i) => i.year === 1993)).toBe(true);
    expect(wolvIssues.every((i) => i.year === 1988)).toBe(true);
  });

  it('normalises "#5 to #14" as "#5-14"', () => {
    const r = parseIssueLine('Collects: Cable #5 to #14', 'core', 1993);
    expect(r).toHaveLength(10);
    expect(r[0].number).toBe(5);
    expect(r[9].number).toBe(10 + 4);
  });

  it('does NOT treat "Collects" as a title on its own', () => {
    // Regression guard against the bug that spawned this whole refactor:
    // pre-fix, "Collects: Cable #5-14" produced issues titled "Collects:
    // Cable" with numbers 5..14. After the fix, the title is "Cable".
    const r = parseIssueLine('Collects: Cable #5-14', 'core', 1993);
    expect(r.every((i) => !i.title.toLowerCase().startsWith('collects'))).toBe(true);
  });

  it('empty after prefix → empty result', () => {
    const r = parseIssueLine('Collects:', 'core', 2020);
    expect(r).toEqual([]);
  });
});
