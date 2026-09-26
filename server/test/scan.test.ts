import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeBrowser, scan } from '../src/scan.js';

// Page with known defects: no lang, no title, img without alt, zoom blocked,
// no skip link, video without captions, plus a subresource on a private IP.
const BAD_PAGE = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, user-scalable=no">
</head><body>
<a href="/contact">Contact</a>
<img src="/logo.png">
<img src="http://10.0.0.1/secret.png" alt="interne">
<img src="/img-to-private" alt="redirigée">
<video src="/film.mp4"></video>
<iframe src="https://www.youtube.com/embed/abc" title="vidéo"></iframe>
</body></html>`;

const GOOD_PAGE = `<!doctype html><html lang="fr"><head><title>Accueil</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<a href="#contenu">Aller au contenu</a>
<main id="contenu"><h1>Bienvenue</h1><p>Texte.</p></main>
</body></html>`;

let base: string;
let server: http.Server;
const guard = { allowIps: new Set(['127.0.0.1']) };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const html = (body: string) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    if (req.url === '/bad') return html(BAD_PAGE);
    if (req.url === '/good') return html(GOOD_PAGE);
    if (req.url === '/img-to-private') return res.writeHead(302, { location: 'http://10.0.0.1/x.png' }).end();
    if (req.url === '/to-private') return res.writeHead(302, { location: 'http://10.0.0.1/' }).end();
    if (req.url === '/to-loopback2') return res.writeHead(302, { location: `http://127.0.0.2:${port()}/good` }).end();
    if (req.url === '/to-good') return res.writeHead(301, { location: '/good' }).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${port()}`;
});
const port = () => (server.address() as AddressInfo).port;

afterAll(async () => {
  await closeBrowser();
  server.close();
});

describe('scan', { timeout: 90_000 }, () => {
  it('reports known defects on both viewports', async () => {
    const steps: string[] = [];
    const r = await scan(new URL(`${base}/bad`), { guard, onStep: (s) => steps.push(s) });
    for (const pass of [r.desktop, r.mobile]) {
      const ids = pass.violations.map((v) => v.id);
      expect(ids).toEqual(expect.arrayContaining(['image-alt', 'html-has-lang', 'document-title']));
      expect(pass.checks.skipLink.found).toBe(false);
      expect(pass.checks.videos.native).toEqual([expect.objectContaining({ hasCaptions: false })]);
      expect(pass.checks.videos.embeds).toEqual(['https://www.youtube.com/embed/abc']);
    }
    expect(r.blockedRequests).toContain('http://10.0.0.1/secret.png');
    expect(steps).toContain('Page chargée (mobile).');
  });

  it('finds the skip link and follows a safe redirect', async () => {
    const r = await scan(new URL(`${base}/to-good`), { guard });
    expect(r.url).toBe(`${base}/to-good`);
    expect(r.finalUrl).toBe(`${base}/good`);
    expect(r.desktop.checks.skipLink).toEqual({ found: true, text: 'Aller au contenu' });
    expect(r.desktop.violations.map((v) => v.id)).not.toContain('html-has-lang');
  });

  it('refuses a redirect to a private IP', async () => {
    await expect(scan(new URL(`${base}/to-private`), { guard })).rejects.toMatchObject({ reason: 'private' });
  });

  it('refuses a redirect to another loopback address', async () => {
    await expect(scan(new URL(`${base}/to-loopback2`), { guard })).rejects.toMatchObject({ reason: 'private' });
  });

  it('blocks a subresource that redirects to a private IP', async () => {
    const r = await scan(new URL(`${base}/bad`), { guard });
    expect(r.blockedRequests).toContain(`${base}/img-to-private`);
  });

  it('turns HTTP errors into a clear message', async () => {
    await expect(scan(new URL(`${base}/missing`), { guard })).rejects.toMatchObject({ reason: 'http', status: 404 });
  });
});
