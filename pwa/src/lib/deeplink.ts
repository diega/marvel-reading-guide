/**
 * Small helpers shared by the default deeplink resolver and various UI
 * components. The actual "open an issue" behaviour lives in
 * `extensions-defaults.ts` as the default implementation of `DeeplinkResolver`
 * — overlays can replace the resolver entirely at runtime.
 */

export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Direct UA matches cover Android + iPhone/iPod + iPad pre-iPadOS13.
  if (/Android|iPhone|iPod/.test(ua)) return true;
  if (/iPad/.test(ua)) return true;
  // iPadOS 13+ reports as desktop Macintosh by default. The only reliable
  // fingerprint is "Macintosh + touch input" — desktop Macs have 0 touch
  // points, iPads report ≥5.
  if (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

/**
 * Marvel's image CDNs (`i.marvelfe.com`, `cdn.marvel.com`) honour a `?w=N`
 * resize query-string. Use it to scale raw 2000px-wide covers (~300-900KB)
 * down to list thumbs (`w=200`, ~22KB) or hero images (`w=800`, ~200KB).
 *
 * Pass-through for non-Marvel hosts.
 */
export function sizedCover(url: string | undefined, width: number): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('marvelfe.com') && !u.hostname.endsWith('marvel.com')) return url;
    u.searchParams.set('w', String(width));
    return u.toString();
  } catch {
    return url;
  }
}
