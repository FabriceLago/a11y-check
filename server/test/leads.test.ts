import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Mail } from '../src/mailer.js';
import { leads, scans } from '../src/schema.js';
import { buildServer, CONSENTEMENT, RETENTION, type App } from '../src/server.js';

const PUBLIC_URL = 'https://93.184.215.14/';
const pass = {
  violations: [{ id: 'image-alt', impact: 'critical', tags: ['wcag111'], nodes: [{ target: ['img'], html: '<img>' }], nodeCount: 1 }],
  incomplete: [],
  checks: { skipLink: { found: true, text: 'Aller au contenu' }, videos: { native: [], embeds: [] } },
};
const fakeScan = (async (url: URL) =>
  ({ url: url.href, finalUrl: url.href, scannedAt: '2026-09-27T10:00:00.000Z', desktop: pass, mobile: pass, blockedRequests: [] }) as never) as never;

let dir: string;
let mails: Mail[];
let t: number;

const start = (opts: Partial<Parameters<typeof buildServer>[0]> = {}) =>
  buildServer({
    scanFn: fakeScan,
    logger: false,
    dbFile: join(dir, 'test.db'),
    sendMail: async (m) => void mails.push(m),
    publicUrl: 'https://outil.example',
    now: () => t,
    ...opts,
  });

async function scanTermine(app: App) {
  const { id } = (await app.inject({ method: 'POST', url: '/api/scan', payload: { url: PUBLIC_URL } })).json();
  for (let i = 0; i < 100; i++) {
    if ((await app.inject({ method: 'GET', url: `/api/scan/${id}` })).json().status === 'done') return id as string;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('scan never finished');
}

const demander = (app: App, id: string, payload: object) => app.inject({ method: 'POST', url: `/api/scan/${id}/email`, payload });
const lead = (app: App, email: string) => app.db.select().from(leads).where(eq(leads.email, email)).get();
const lienDe = (mail: Mail, action: string) => mail.html.match(new RegExp(`/api/leads/[\\w-]+/${action}`))?.[0];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'a11y-'));
  mails = [];
  t = Date.parse('2026-09-27T10:00:00Z');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('persistence', () => {
  it('keeps reports across a restart', async () => {
    let app = await start();
    const id = await scanTermine(app);
    await app.close();
    app = await start();
    const job = (await app.inject({ method: 'GET', url: `/api/scan/${id}` })).json();
    expect(job).toMatchObject({ status: 'done', report: { score: 85 } });
    await app.close();
  });

  it('marks scans interrupted by a restart as failed, with a clear message', async () => {
    let app = await start();
    await app.db.insert(scans).values({ id: 'x', url: PUBLIC_URL, status: 'running', createdAt: new Date(t) });
    await app.close();
    app = await start();
    const job = (await app.inject({ method: 'GET', url: '/api/scan/x' })).json();
    expect(job).toMatchObject({ status: 'error', error: expect.stringContaining('interrompue') });
    await app.close();
  });
});

describe('report by e-mail', () => {
  let app: App;
  let id: string;
  beforeEach(async () => {
    app = await start();
    id = await scanTermine(app);
  });
  afterEach(() => app.close());

  it('exposes the consent wording and its version', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/consentement' })).json()).toEqual(CONSENTEMENT);
  });

  it('sends the report without any marketing consent when the box is unticked', async () => {
    const res = await demander(app, id, { email: ' Marie@Exemple.BE ', conseils: false });
    expect(res.statusCode).toBe(202);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('marie@exemple.be');
    expect(mails[0].subject).toContain('85/100');
    expect(mails[0].html).toContain('<html lang="fr">');
    expect(mails[0].text).toContain('Score : 85 sur 100');
    expect(lienDe(mails[0], 'confirmer')).toBeUndefined();
    expect(lienDe(mails[0], 'supprimer')).toBeDefined();
    expect(await lead(app, 'marie@exemple.be')).toMatchObject({ marketingConsent: 'none', consentText: null });
  });

  it('records the exact consent wording and starts a double opt-in when ticked', async () => {
    await demander(app, id, { email: 'marie@exemple.be', conseils: true, consentVersion: CONSENTEMENT.version });
    expect(await lead(app, 'marie@exemple.be')).toMatchObject({
      marketingConsent: 'pending',
      consentText: CONSENTEMENT.texte,
      consentVersion: CONSENTEMENT.version,
      consentRequestedAt: new Date(t),
      consentConfirmedAt: null,
    });
    expect(lienDe(mails[0], 'confirmer')).toBeDefined();
  });

  it('refuses a consent given on an outdated wording', async () => {
    const res = await demander(app, id, { email: 'marie@exemple.be', conseils: true, consentVersion: '2020-01-01' });
    expect(res.statusCode).toBe(400);
    expect(mails).toHaveLength(0);
  });

  it('rejects invalid addresses in French', async () => {
    const res = await demander(app, id, { email: 'marie@', conseils: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('ne semble pas valide');
  });

  it('answers 404 for an unknown report', async () => {
    expect((await demander(app, 'nope', { email: 'marie@exemple.be', conseils: false })).statusCode).toBe(404);
  });

  it('answers 502 when the e-mail cannot be sent', async () => {
    await app.close();
    app = await start({ sendMail: async () => { throw new Error('smtp down'); } });
    const res = await demander(app, id, { email: 'marie@exemple.be', conseils: false });
    expect(res.statusCode).toBe(502);
    expect(res.json().message).toContain("n'a pas pu être envoyé");
  });

  it('limits e-mails to 3 per hour', async () => {
    for (let i = 0; i < 3; i++) expect((await demander(app, id, { email: `a${i}@exemple.be`, conseils: false })).statusCode).toBe(202);
    expect((await demander(app, id, { email: 'a4@exemple.be', conseils: false })).statusCode).toBe(429);
  });
});

describe('links from the e-mail', () => {
  let app: App;
  let lien: (action: string) => string;
  beforeEach(async () => {
    app = await start();
    const id = await scanTermine(app);
    await demander(app, id, { email: 'marie@exemple.be', conseils: true, consentVersion: CONSENTEMENT.version });
    lien = (action) => lienDe(mails[0], action) ?? lienDe(mails[0], 'supprimer')!.replace('supprimer', action);
  });
  afterEach(() => app.close());

  it('GET only shows a confirmation page (mail scanners must not confirm for the user)', async () => {
    const res = await app.inject({ method: 'GET', url: lien('confirmer') });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<html lang="fr">');
    expect(res.body).toContain('<button type="submit">Je confirme</button>');
    expect((await lead(app, 'marie@exemple.be'))?.marketingConsent).toBe('pending');
  });

  it('POST confirms, with a timestamp', async () => {
    t += 60_000;
    const res = await app.inject({ method: 'POST', url: lien('confirmer'), headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    expect(res.statusCode).toBe(200);
    expect(await lead(app, 'marie@exemple.be')).toMatchObject({ marketingConsent: 'confirmed', consentConfirmedAt: new Date(t) });
  });

  it('an unticked box later never withdraws a confirmed consent', async () => {
    await app.inject({ method: 'POST', url: lien('confirmer') });
    await demander(app, (await lead(app, 'marie@exemple.be'))!.scanId!, { email: 'marie@exemple.be', conseils: false });
    expect((await lead(app, 'marie@exemple.be'))?.marketingConsent).toBe('confirmed');
  });

  it('unsubscribes in one click', async () => {
    await app.inject({ method: 'POST', url: lien('desinscrire') });
    expect(await lead(app, 'marie@exemple.be')).toMatchObject({ marketingConsent: 'withdrawn', consentWithdrawnAt: new Date(t) });
  });

  it('deletes all the data in one click, and the link then stops working', async () => {
    const res = await app.inject({ method: 'POST', url: lien('supprimer') });
    expect(res.body).toContain('supprimées');
    expect(await lead(app, 'marie@exemple.be')).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: lien('supprimer') })).statusCode).toBe(404);
  });

  it('rejects unknown tokens and actions', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/leads/faux/confirmer' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: lien('supprimer').replace('supprimer', 'pirater') })).statusCode).toBe(404);
  });
});

describe('retention', () => {
  it('expires unconfirmed consents after 7 days', async () => {
    const app = await start();
    const id = await scanTermine(app);
    await demander(app, id, { email: 'marie@exemple.be', conseils: true, consentVersion: CONSENTEMENT.version });
    t += RETENTION.confirmation + 1;
    await app.purge();
    expect((await lead(app, 'marie@exemple.be'))?.marketingConsent).toBe('none');
    const res = await app.inject({ method: 'POST', url: lienDe(mails[0], 'confirmer')! });
    expect(res.statusCode).toBe(410);
    await app.close();
  });

  it('deletes reports after 12 months and contacts 3 years after the last contact', async () => {
    const app = await start();
    const id = await scanTermine(app);
    await demander(app, id, { email: 'marie@exemple.be', conseils: false });

    t += RETENTION.scans + 1;
    await app.purge();
    expect((await app.inject({ method: 'GET', url: `/api/scan/${id}` })).statusCode).toBe(404);
    expect(await lead(app, 'marie@exemple.be')).toMatchObject({ scanId: null }); // contact kept, link cleared

    t += RETENTION.leads;
    await app.purge();
    expect(await lead(app, 'marie@exemple.be')).toBeUndefined();
    await app.close();
  });
});
