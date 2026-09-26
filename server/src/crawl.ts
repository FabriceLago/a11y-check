import { scan, type ScanResult } from './scan.js';
import { parsePublicUrl, type Guard } from './ssrf.js';

export const MAX_PAGES = 10;
const FICHIER = /\.(pdf|jpe?g|png|gif|svg|webp|avif|zip|rar|docx?|xlsx?|pptx?|odt|ods|mp3|mp4|mov|avi|ics|vcf)$/i;
const hote = (u: URL) => u.hostname.replace(/^www\./, '');

/**
 * Home page first, then internal links from header / nav / footer, in document order.
 * Same site only, no files, no anchors; query strings are kept (some CMS route with them).
 */
export function choisirPages(accueil: string, liens: string[], max = MAX_PAGES): string[] {
  const base = new URL(accueil);
  const vus = new Set<string>();
  const pages: string[] = [];
  // Same page whatever the scheme, "www." or trailing slash.
  const cle = (u: URL) => `${hote(u)}${u.port ? `:${u.port}` : ''}${u.pathname.replace(/\/+$/, '') || '/'}${u.search}`;

  for (const brut of [accueil, ...liens]) {
    if (pages.length >= max) break;
    let u: URL;
    try {
      u = new URL(brut, base);
    } catch {
      continue;
    }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || hote(u) !== hote(base) || FICHIER.test(u.pathname)) continue;
    u.hash = '';
    if (vus.has(cle(u))) continue;
    vus.add(cle(u));
    pages.push(u.href);
  }
  return pages;
}

export type PageAnalysee = { url: string; result: ScanResult };
export type AnalyseSite = (url: URL, opts: { guard?: Guard; onProgress?: (fait: number, total: number) => void }) => Promise<PageAnalysee[]>;

/**
 * Full-site scan for the paid report. A page that fails (404, timeout) is skipped,
 * not fatal; only the home page is mandatory.
 */
export const analyserSite: AnalyseSite = async (url, { guard = {}, onProgress = () => {} }) => {
  const accueil = await scan(url, { guard, details: true });
  const urls = choisirPages(accueil.finalUrl, accueil.desktop.liens ?? []);
  const pages: PageAnalysee[] = [{ url: accueil.finalUrl, result: accueil }];
  onProgress(1, urls.length);
  for (const [i, autre] of urls.slice(1).entries()) {
    try {
      // Links come from the scanned site (untrusted): full SSRF validation again (ports, IP literals…).
      pages.push({ url: autre, result: await scan(parsePublicUrl(autre, guard), { guard, details: true }) });
    } catch {
      // ponytail: skipped pages are silent; list them in the PDF if customers ask why a page is missing.
    }
    onProgress(i + 2, urls.length);
  }
  return pages;
};
