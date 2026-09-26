import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

// Public IP literal: no DNS needed, no browser started (scanFn is faked).
const PUBLIC_URL = 'https://93.184.215.14/';
const pass = {
  violations: [{ id: 'image-alt', impact: 'critical', tags: ['wcag111'], nodes: [{ target: ['img'], html: '<img src="a.png">' }], nodeCount: 1 }],
  incomplete: [],
  checks: { skipLink: { found: true, text: 'Aller au contenu' }, videos: { native: [], embeds: [] } },
};
const fakeScan = (async (url: URL, { onStep }: { onStep?: (m: string) => void } = {}) => {
  onStep?.('Page chargée (ordinateur).');
  return { url: url.href, finalUrl: url.href, scannedAt: '2026-09-27T10:00:00.000Z', desktop: pass, mobile: pass, blockedRequests: [] } as never;
}) as never;

const post = (app: Awaited<ReturnType<typeof buildServer>>, url: unknown) =>
  app.inject({ method: 'POST', url: '/api/scan', payload: { url } });

async function attendreFin(app: Awaited<ReturnType<typeof buildServer>>, id: string) {
  for (let i = 0; i < 100; i++) {
    const job = (await app.inject({ method: 'GET', url: `/api/scan/${id}` })).json();
    if (job.status === 'done' || job.status === 'error') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('scan never finished');
}

describe('POST /api/scan', () => {
  it('rejects private targets with a French message', async () => {
    const app = await buildServer({ scanFn: fakeScan, logger: false });
    const res = await post(app, 'http://169.254.169.254/');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'private', message: expect.stringContaining('réseau privé') });
    await app.close();
  });

  it('rejects malformed bodies', async () => {
    const app = await buildServer({ scanFn: fakeScan, logger: false });
    expect((await post(app, 42)).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/scan', payload: {} })).statusCode).toBe(400);
    await app.close();
  });

  it('queues a scan and exposes its progress and result', async () => {
    const app = await buildServer({ scanFn: fakeScan, logger: false });
    const res = await post(app, PUBLIC_URL);
    expect(res.statusCode).toBe(202);
    const { id } = res.json();
    const job = await attendreFin(app, id);
    expect(job).toMatchObject({ status: 'done', report: { url: PUBLIC_URL, score: 85, totalProblemes: 1 } });
    // Raw scan and selectors stay server-side (paid PDF).
    expect(job.result).toBeUndefined();
    expect(job.report.problemes[0].elements).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain('a.png');
    await app.close();
  });

  it('returns 404 for unknown scans', async () => {
    const app = await buildServer({ scanFn: fakeScan, logger: false });
    expect((await app.inject({ method: 'GET', url: '/api/scan/nope' })).statusCode).toBe(404);
    await app.close();
  });

  it('rate limits after 5 scans per hour', async () => {
    const app = await buildServer({ scanFn: fakeScan, logger: false });
    for (let i = 0; i < 5; i++) expect((await post(app, PUBLIC_URL)).statusCode).toBe(202);
    const res = await post(app, PUBLIC_URL);
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toContain('5 demandes par heure');
    await app.close();
  });
});
