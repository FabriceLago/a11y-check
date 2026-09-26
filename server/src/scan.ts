import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Browser, type BrowserContextOptions, type Page, type Route } from 'playwright';
import { AXE_TAGS } from './rules-fr.js';
import { parsePublicUrl, safeLookup, UnsafeUrlError, type Guard } from './ssrf.js';
const PAGE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024;
const MAX_NODES_PER_RULE = 50;
const MAX_REDIRECTS = 10;
const BOT_URL = process.env.BOT_INFO_URL ?? 'https://example.invalid/robot';

export type ScanOptions = { guard?: Guard; onStep?: (message: string) => void; details?: boolean };

let browserPromise: Promise<Browser> | undefined;

export function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium
    .launch({
      args: [
        // Safety net: anything that escapes page.route hits a dead proxy.
        // <-loopback> stops Chromium from bypassing the proxy for localhost.
        '--proxy-server=http://127.0.0.1:9',
        '--proxy-bypass-list=<-loopback>',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
    })
    .then((b) => {
      b.on('disconnected', () => (browserPromise = undefined));
      return b;
    });
  return browserPromise;
}

export async function closeBrowser() {
  const b = await browserPromise;
  browserPromise = undefined;
  await b?.close();
}

function userAgent(chromeVersion: string, mobile: boolean) {
  const platform = mobile ? 'Linux; Android 14; K' : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}${mobile ? ' Mobile' : ''} Safari/537.36 A11yCheckBot/1.0 (+${BOT_URL})`;
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'host', 'upgrade']);

function send(url: URL, method: string, headers: Record<string, string>, body: Buffer | undefined, guard: Guard) {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const r = client.request(url, { method, headers, lookup: safeLookup(guard), timeout: PAGE_TIMEOUT_MS }, resolve);
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.end(body);
  });
}

/**
 * Follows redirects in Node, re-validating every hop (URL + IP at connect time).
 * Needed because Chromium follows a fulfilled 3xx itself, bypassing page.route.
 */
async function follow(url: URL, method: string, headers: Record<string, string>, body: Buffer | undefined, guard: Guard) {
  for (let hop = 0; ; hop++) {
    const res = await send(url, method, headers, body, guard);
    const status = res.statusCode ?? 0;
    if (status < 300 || status > 399 || !res.headers.location) return { url, res };
    res.resume();
    if (hop >= MAX_REDIRECTS) throw new ScanError('unreachable');
    url = parsePublicUrl(new URL(res.headers.location, url).href, guard);
    if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
    }
  }
}

/** Resolves the redirect chain up front so the browser loads the final URL (relative links stay right). */
async function resolveFinalUrl(target: URL, ua: string, guard: Guard): Promise<URL> {
  try {
    const { url, res } = await follow(target, 'GET', { 'user-agent': ua, accept: 'text/html' }, undefined, guard);
    res.destroy();
    return url;
  } catch (e) {
    if (e instanceof UnsafeUrlError || e instanceof ScanError) throw e;
    throw new ScanError('unreachable');
  }
}

/** Every browser request is replayed from Node, so private IPs are unreachable. */
async function relay(route: Route, guard: Guard, blockedRequests: string[]) {
  const req = route.request();
  let url: URL;
  try {
    url = parsePublicUrl(req.url(), guard);
  } catch {
    blockedRequests.push(req.url());
    return route.abort('blockedbyclient');
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(await req.allHeaders())) {
    if (!k.startsWith(':') && !HOP_BY_HOP.has(k)) headers[k] = v;
  }
  headers['accept-encoding'] = 'gzip, deflate, br';

  try {
    const { res } = await follow(url, req.method(), headers, req.postDataBuffer() ?? undefined, guard);

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        res.destroy();
        throw new Error('response too large');
      }
      chunks.push(chunk);
    }
    let body = Buffer.concat(chunks);
    const encoding = res.headers['content-encoding'];
    if (encoding === 'gzip') body = zlib.gunzipSync(body);
    else if (encoding === 'deflate') body = zlib.inflateSync(body);
    else if (encoding === 'br') body = zlib.brotliDecompressSync(body);

    const outHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      if (v === undefined || HOP_BY_HOP.has(k)) continue;
      outHeaders[k] = Array.isArray(v) ? v.join(k === 'set-cookie' ? '\n' : ', ') : v;
    }
    await route.fulfill({ status: res.statusCode ?? 502, headers: outHeaders, body });
  } catch (e) {
    if (e instanceof UnsafeUrlError) blockedRequests.push(req.url());
    await route.abort('failed').catch(() => {});
  }
}

/** Checks axe does not cover. lang / title / zoom are already axe rules. */
function extraChecks() {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].slice(0, 5);
  const skip = links.find((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('#') || href.length < 2) return false;
    const id = decodeURIComponent(href.slice(1));
    return !!document.getElementById(id) || document.getElementsByName(id).length > 0;
  });
  const videos = [...document.querySelectorAll('video')].map((v) => ({
    src: v.currentSrc || v.getAttribute('src') || v.querySelector('source')?.getAttribute('src') || null,
    hasCaptions: !!v.querySelector('track[kind="captions"], track[kind="subtitles"]'),
  }));
  const embeds = [...document.querySelectorAll<HTMLIFrameElement>('iframe[src]')]
    .map((f) => f.src)
    .filter((src) => /(youtube(-nocookie)?\.com|youtu\.be|vimeo\.com|dailymotion\.com)\//.test(src));
  return {
    skipLink: { found: !!skip, text: skip?.textContent?.trim() || null },
    videos: { native: videos, embeds }, // embeds: captions cannot be detected, manual check
  };
}

export class ScanError extends Error {
  constructor(public readonly reason: 'unreachable' | 'http' | 'timeout', public readonly status?: number) {
    super(
      reason === 'timeout' ? 'Le site a mis trop de temps à répondre (plus de 30 secondes).'
      : reason === 'http' ? `Le site a répondu avec une erreur (code ${status}).`
      : "Le site n'a pas pu être chargé.",
    );
  }
}

export type Capture = { regle: string; selecteur: string; image: string };
const MAX_CAPTURES_PAR_REGLE = 3;
const MAX_CAPTURES_PAR_PAGE = 12;
const ORDRE_IMPACT: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const SELECTEUR_NAVIGATION =
  'header a[href], nav a[href], footer a[href], [role="banner"] a[href], [role="navigation"] a[href], [role="contentinfo"] a[href]';

/** Screenshot of each faulty element, outlined in red, most severe rules first. */
async function capturer(page: Page, violations: { id: string; impact?: string | null; nodes: { target: unknown[] }[] }[]) {
  const captures: Capture[] = [];
  const triees = [...violations].sort((a, b) => ORDRE_IMPACT[a.impact ?? 'minor'] - ORDRE_IMPACT[b.impact ?? 'minor']);
  for (const v of triees) {
    for (const node of v.nodes.slice(0, MAX_CAPTURES_PAR_REGLE)) {
      if (captures.length >= MAX_CAPTURES_PAR_PAGE) return captures;
      const [selecteur, ...dansUnCadre] = node.target;
      if (dansUnCadre.length || typeof selecteur !== 'string') continue; // iframe / shadow DOM: skip
      try {
        const el = page.locator(selecteur).first();
        await el.scrollIntoViewIfNeeded({ timeout: 2000 });
        const box = await el.boundingBox();
        const vp = page.viewportSize();
        if (!box || !vp || box.width < 2 || box.height < 2) continue;
        await el.evaluate((e: HTMLElement) => {
          e.dataset.a11yOutline = e.style.cssText;
          e.style.outline = '4px solid #d6001c';
          e.style.outlineOffset = '3px';
        });
        const pad = 16;
        const x = Math.max(0, box.x - pad);
        const y = Math.max(0, box.y - pad);
        const clip = { x, y, width: Math.min(vp.width - x, box.width + 2 * pad), height: Math.min(vp.height - y, box.height + 2 * pad, 600) };
        if (clip.width > 0 && clip.height > 0) {
          const buf = await page.screenshot({ clip, type: 'jpeg', quality: 70, timeout: 5000 });
          captures.push({ regle: v.id, selecteur, image: `data:image/jpeg;base64,${buf.toString('base64')}` });
        }
        await el.evaluate((e: HTMLElement) => {
          e.style.cssText = e.dataset.a11yOutline ?? '';
          delete e.dataset.a11yOutline;
        });
      } catch {
        // Element hidden, detached or not scrollable: no screenshot for it.
      }
    }
  }
  return captures;
}

async function runPass(page: Page, target: URL, label: string, onStep: (m: string) => void, details = false) {
  onStep(`Chargement de la page (${label})…`);
  let response;
  try {
    response = await page.goto(target.href, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
  } catch (e) {
    throw (e as Error).name === 'TimeoutError' ? new ScanError('timeout') : new ScanError('unreachable');
  }
  if (!response) throw new ScanError('unreachable');
  if (response.status() >= 400) throw new ScanError('http', response.status());
  onStep(`Page chargée (${label}).`);

  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const trim = <T extends { nodes: unknown[] }>(r: T) => ({ ...r, nodes: r.nodes.slice(0, MAX_NODES_PER_RULE), nodeCount: r.nodes.length });
  onStep(`${axe.passes.length + axe.violations.length} points vérifiés (${label}).`);
  return {
    finalUrl: page.url(),
    title: await page.title(),
    violations: axe.violations.map(trim),
    incomplete: axe.incomplete.map(trim),
    passes: axe.passes.map((r) => r.id),
    axeVersion: axe.testEngine.version,
    checks: await page.evaluate(extraChecks),
    /** Paid report only (desktop pass): navigation links to crawl, screenshots of faulty elements. */
    liens: details ? await page.$$eval(SELECTEUR_NAVIGATION, (as) => as.map((a) => (a as HTMLAnchorElement).href)) : undefined,
    captures: details ? await capturer(page, axe.violations) : undefined,
  };
}

export async function scan(target: URL, { guard = {}, onStep = () => {}, details = false }: ScanOptions = {}) {
  const browser = await getBrowser();
  const blockedRequests: string[] = [];
  const requestedUrl = target.href;
  onStep('Connexion au site…');
  target = await resolveFinalUrl(target, userAgent(browser.version(), false), guard);
  const passes = [
    { label: 'ordinateur', options: { viewport: { width: 1280, height: 800 } } },
    { label: 'mobile', options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ] satisfies { label: string; options: BrowserContextOptions }[];

  const results = [];
  for (const { label, options } of passes) {
    const context = await browser.newContext({
      ...options,
      userAgent: userAgent(browser.version(), label === 'mobile'),
      locale: 'fr-BE',
      serviceWorkers: 'block',
    });
    try {
      await context.route('**/*', (route) => relay(route, guard, blockedRequests));
      await context.routeWebSocket(/.*/, (ws) => ws.close());
      results.push(await runPass(await context.newPage(), target, label, onStep, details && label === 'ordinateur'));
    } finally {
      await context.close();
    }
  }
  const [desktop, mobile] = results;
  return {
    url: requestedUrl,
    finalUrl: desktop.finalUrl,
    scannedAt: new Date().toISOString(),
    desktop,
    mobile,
    blockedRequests: [...new Set(blockedRequests)],
  };
}

export type ScanResult = Awaited<ReturnType<typeof scan>>;
