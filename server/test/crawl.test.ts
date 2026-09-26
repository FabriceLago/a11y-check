import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyserSite, choisirPages, type PageAnalysee } from '../src/crawl.js';
import { pdfHtml, renderPdf } from '../src/pdf.js';
import { closeBrowser } from '../src/scan.js';
import { buildSiteReport } from '../src/site-report.js';

describe('choisirPages', () => {
  const accueil = 'https://www.boulangerie.be/';
  it('keeps the home page first, same site only, no files, no duplicates', () => {
    expect(
      choisirPages(accueil, [
        'https://www.boulangerie.be/contact',
        'https://boulangerie.be/contact/', // same page (www, trailing slash)
        'https://www.boulangerie.be/contact#plan', // anchor only
        'https://www.boulangerie.be/',
        'https://www.facebook.com/boulangerie',
        'mailto:info@boulangerie.be',
        'tel:+3221234567',
        'https://www.boulangerie.be/tarifs.pdf',
        'https://www.boulangerie.be/produits?categorie=pains',
      ]),
    ).toEqual(['https://www.boulangerie.be/', 'https://www.boulangerie.be/contact', 'https://www.boulangerie.be/produits?categorie=pains']);
  });

  it('stops at 10 pages', () => {
    const liens = Array.from({ length: 30 }, (_, i) => `https://www.boulangerie.be/p${i}`);
    expect(choisirPages(accueil, liens)).toHaveLength(10);
  });

  it('ignores garbage', () => {
    expect(choisirPages(accueil, ['javascript:void(0)', 'http://[::1', ''])).toEqual([accueil]);
  });
});

// A 13-page fixture site: every page has an image without description.
const page = (titre: string, liens = '') => `<!doctype html><html lang="fr"><head><title>${titre}</title></head><body>
<header><nav>${liens}</nav></header>
<main><h1>${titre}</h1><img src="/photo.png" width="120" height="80" style="background:#ccc;display:block"></main>
<footer><a href="/mentions">Mentions</a><a href="https://ailleurs.example/">Partenaire</a></footer></body></html>`;

let base: string;
let server: http.Server;
let pages: PageAnalysee[];
const guard = { allowIps: new Set(['127.0.0.1']) };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const nav = Array.from({ length: 12 }, (_, i) => `<a href="/p${i + 1}">Page ${i + 1}</a>`).join('') + '<a href="/tarifs.pdf">Tarifs</a>';
    if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(page('Accueil', nav));
    if (/^\/(p\d+|mentions)$/.test(req.url!)) return res.writeHead(200, { 'content-type': 'text/html' }).end(page(`Page ${req.url!.slice(1)}`));
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await closeBrowser();
  server.close();
});

describe('analyserSite + PDF', { timeout: 240_000 }, () => {
  it('crawls up to 10 pages from the navigation, with screenshots', async () => {
    const progres: string[] = [];
    pages = await analyserSite(new URL(base), { guard, onProgress: (f, t) => progres.push(`${f}/${t}`) });
    expect(pages).toHaveLength(10);
    expect(pages[0].url).toBe(`${base}/`);
    expect(pages.map((p) => p.url)).not.toContain(`${base}/tarifs.pdf`);
    expect(progres.at(-1)).toBe('10/10');
    const capture = pages[0].result.desktop.captures?.find((c) => c.regle === 'image-alt');
    expect(capture?.image).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('merges problems across pages', () => {
    const r = buildSiteReport(pages);
    const img = r.problemes.find((p) => p.id === 'image-alt')!;
    expect(img.pages).toHaveLength(10);
    expect(img.occurrences).toBe(10);
    expect(r.mentions.at(-1)).toContain('10 pages');
  });

  it('describes every screenshot with a text alternative', () => {
    const html = pdfHtml(buildSiteReport(pages));
    const imgs = html.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.every((i) => /alt="Capture \d+ : [^"]{20,}"/.test(i))).toBe(true);
    expect(html).toContain('<html lang="fr">');
    expect(html).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)[^"'\s]*\.(css|js|woff2?)/); // nothing loaded from outside
  });

  it('renders a tagged PDF: language, structure tree, bookmarks', async () => {
    const pdf = await renderPdf(buildSiteReport(pages));
    expect(pdf.length).toBeLessThan(8 * 1024 * 1024);
    const doc = await PDFDocument.load(pdf);
    const cat = doc.catalog;
    expect((cat.lookup(PDFName.of('Lang')) as PDFString).decodeText()).toBe('fr');
    expect(cat.lookup(PDFName.of('StructTreeRoot'))).toBeInstanceOf(PDFDict);
    expect((cat.lookup(PDFName.of('MarkInfo'), PDFDict).lookup(PDFName.of('Marked')) as PDFBool).asBoolean()).toBe(true);
    const outlines = cat.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlines.lookup(PDFName.of('First'))).toBeInstanceOf(PDFDict);
    expect(doc.getTitle()).toContain("Rapport d'accessibilité");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(8);
    void PDFArray;
  });
});
