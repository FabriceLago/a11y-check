import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageAnalysee } from '../src/crawl.js';
import type { Mail } from '../src/mailer.js';
import { orders } from '../src/schema.js';
import { buildServer, type App } from '../src/server.js';

const SECRET = 'whsec_test_secret';
const vrai = new Stripe('sk_test_hors_ligne'); // only used for its offline webhook helpers
const PUBLIC_URL = 'https://93.184.215.14/';
const PDF = Buffer.from('%PDF-1.7 faux');

const pass = {
  title: 'Accueil',
  violations: [{ id: 'image-alt', impact: 'critical', tags: ['wcag111'], nodes: [{ target: ['img'], html: '<img>' }], nodeCount: 1 }],
  incomplete: [],
  checks: { skipLink: { found: true, text: 'Aller au contenu' }, videos: { native: [], embeds: [] } },
  captures: [],
};
const resultat = (url: string) => ({ url, finalUrl: url, scannedAt: '2026-09-27T10:00:00.000Z', desktop: pass, mobile: pass, blockedRequests: [] });
const fakeScan = (async (url: URL) => resultat(url.href) as never) as never;
const analyserOk = vi.fn(async (url: URL) => [{ url: url.href, result: resultat(url.href) }] as unknown as PageAnalysee[]);

let dir: string;
let mails: Mail[];
let stripe: { checkout: { sessions: { create: ReturnType<typeof vi.fn> } }; refunds: { create: ReturnType<typeof vi.fn> }; webhooks: Stripe['webhooks'] };

const start = (opts: Parameters<typeof buildServer>[0] = {}) =>
  buildServer({
    scanFn: fakeScan,
    logger: false,
    dbFile: join(dir, 'test.db'),
    pdfDir: join(dir, 'pdf'),
    sendMail: async (m) => void mails.push(m),
    publicUrl: 'https://outil.example',
    stripe: stripe as unknown as Stripe,
    webhookSecret: SECRET,
    adminEmail: 'admin@outil.example',
    analyser: analyserOk,
    pdf: async () => PDF,
    retryMs: 1,
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

const evenement = (scanId: string, patch: Record<string, unknown> = {}, id = 'evt_1') => ({
  id,
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      object: 'checkout.session',
      payment_status: 'paid',
      metadata: { scanId },
      customer_details: { email: 'client@exemple.be' },
      amount_total: 3900,
      currency: 'eur',
      payment_intent: 'pi_1',
      ...patch,
    },
  },
});

function webhook(app: App, event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const signature = vrai.webhooks.generateTestHeaderString({ payload, secret });
  return app.inject({ method: 'POST', url: '/api/stripe/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
}

async function attendreStatut(app: App, statuts: string[]) {
  for (let i = 0; i < 200; i++) {
    const res = await app.inject({ method: 'GET', url: '/api/commandes/cs_test_1' });
    if (res.statusCode === 200 && statuts.includes(res.json().statut)) return res.json();
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`statut jamais atteint : ${statuts}`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'a11y-cmd-'));
  mails = [];
  analyserOk.mockClear();
  stripe = {
    checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' })) } },
    refunds: { create: vi.fn(async () => ({ id: 're_1' })) },
    webhooks: vrai.webhooks,
  };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Checkout', () => {
  it('exposes the offer', async () => {
    const app = await start();
    expect((await app.inject({ method: 'GET', url: '/api/offre' })).json()).toEqual({ libelle: '39 € TVAC', disponible: true });
    await app.close();
  });

  it('creates a French Checkout session with price, withdrawal waiver and return URLs', async () => {
    const app = await start();
    const scanId = await scanTermine(app);
    const res = await app.inject({ method: 'POST', url: `/api/scan/${scanId}/commande` });
    expect(res.json()).toEqual({ url: 'https://checkout.stripe.test/cs_test_1' });
    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'payment',
      locale: 'fr',
      metadata: { scanId },
      consent_collection: { terms_of_service: 'required' },
      invoice_creation: { enabled: true },
      success_url: 'https://outil.example/commande/{CHECKOUT_SESSION_ID}',
      cancel_url: `https://outil.example/analyse/${scanId}?paiement=annule`,
    });
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'eur', unit_amount: 3900, tax_behavior: 'inclusive' });
    expect(params.custom_text.terms_of_service_acceptance.message).toContain('droit de rétractation');
    await app.close();
  });

  it('says clearly when payment is not configured', async () => {
    const app = await start({ stripe: null });
    const scanId = await scanTermine(app);
    const res = await app.inject({ method: 'POST', url: `/api/scan/${scanId}/commande` });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toContain("n'est pas encore disponible");
    expect((await app.inject({ method: 'GET', url: '/api/offre' })).json().disponible).toBe(false);
    await app.close();
  });
});

describe('Webhook', () => {
  let app: App;
  let scanId: string;
  beforeEach(async () => {
    app = await start();
    scanId = await scanTermine(app);
  });
  afterEach(() => app.close());

  it('rejects a forged signature', async () => {
    const res = await webhook(app, evenement(scanId), 'whsec_pirate');
    expect(res.statusCode).toBe(400);
    expect(await app.db.select().from(orders).all()).toHaveLength(0);
  });

  it('ignores a session that is not paid', async () => {
    await webhook(app, evenement(scanId, { payment_status: 'unpaid' }));
    expect(await app.db.select().from(orders).all()).toHaveLength(0);
  });

  it('delivers once: PDF attached, download link, order ready', async () => {
    expect((await webhook(app, evenement(scanId))).statusCode).toBe(200);
    const statut = await attendreStatut(app, ['ready']);
    expect(statut).toMatchObject({ site: '93.184.215.14', email: 'c•••@exemple.be', telechargement: expect.stringMatching(/^\/api\/commandes\/telechargement\//) });

    const livraison = mails.find((m) => m.to === 'client@exemple.be')!;
    expect(livraison.subject).toContain('rapport');
    expect(livraison.attachments?.[0]).toMatchObject({ filename: 'rapport-accessibilite-93.184.215.14.pdf', contentType: 'application/pdf' });
    expect(livraison.html).toContain('/api/commandes/telechargement/');

    const pdf = await app.inject({ method: 'GET', url: statut.telechargement });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('attachment');
    expect(pdf.rawPayload.equals(PDF)).toBe(true);
  });

  it('is idempotent when Stripe sends the same event twice', async () => {
    await webhook(app, evenement(scanId));
    await webhook(app, evenement(scanId));
    await webhook(app, evenement(scanId, {}, 'evt_2')); // new event, same session
    await attendreStatut(app, ['ready']);
    expect(await app.db.select().from(orders).all()).toHaveLength(1);
    expect(analyserOk).toHaveBeenCalledTimes(1);
    expect(mails.filter((m) => m.to === 'client@exemple.be')).toHaveLength(1);
  });

  it('never exposes the PDF without the secret token', async () => {
    await webhook(app, evenement(scanId));
    await attendreStatut(app, ['ready']);
    const [commande] = await app.db.select().from(orders).all();
    expect((await app.inject({ method: 'GET', url: `/api/commandes/telechargement/${commande.id}` })).statusCode).toBe(404);
  });
});

describe('Failures', () => {
  it('retries twice, then refunds automatically, apologises and alerts the admin', async () => {
    const analyser = vi.fn(async () => {
      throw new Error('site hors ligne');
    });
    const app = await start({ analyser });
    const scanId = await scanTermine(app);
    await webhook(app, evenement(scanId));
    await attendreStatut(app, ['refunded']);

    expect(analyser).toHaveBeenCalledTimes(3);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: expect.stringMatching(/^refund-/) });
    expect(mails.find((m) => m.to === 'client@exemple.be')?.text).toContain('intégralement remboursé');
    expect(mails.find((m) => m.to === 'admin@outil.example')?.text).toContain('site hors ligne');
    await app.close();
  });

  it('flags a failed refund for manual handling', async () => {
    stripe.refunds.create.mockRejectedValue(new Error('stripe down'));
    const app = await start({ analyser: async () => { throw new Error('boom'); } });
    const scanId = await scanTermine(app);
    await webhook(app, evenement(scanId));
    await attendreStatut(app, ['failed']);
    expect(mails.find((m) => m.to === 'admin@outil.example')?.text).toContain('manuellement');
    await app.close();
  });

  it('resumes paid orders after a restart', async () => {
    let app = await start();
    const scanId = await scanTermine(app);
    // State left by a crash in the middle of a delivery.
    await app.db.insert(orders).values({
      id: 'o1', stripeSessionId: 'cs_test_1', scanId, url: PUBLIC_URL, email: 'client@exemple.be', amountTotal: 3900,
      currency: 'eur', paymentIntent: 'pi_1', status: 'processing', attempts: 1, downloadToken: 'jeton', createdAt: new Date(),
    });
    await app.close();

    app = await start();
    await attendreStatut(app, ['ready']);
    expect((await app.db.select().from(orders).where(eq(orders.id, 'o1')).get())?.attempts).toBe(2);
    await app.close();
  });
});
