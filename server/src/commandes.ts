import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, inArray, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type PQueue from 'p-queue';
import type Stripe from 'stripe';
import { analyserSite, type AnalyseSite } from './crawl.js';
import type { Db } from './db.js';
import type { SendMail } from './mailer.js';
import { creerSession, OFFRE } from './paiement.js';
import { renderPdf } from './pdf.js';
import { orders, scans, stripeEvents } from './schema.js';
import { buildSiteReport, type SiteReport } from './site-report.js';
import type { Guard } from './ssrf.js';
import { alerteAdmin, excusesEmail, livraisonEmail } from './templates.js';

const DAY = 86_400_000;
export const MAX_ESSAIS = 3;
const MAX_PIECE_JOINTE = 8 * 1024 * 1024;
const VALIDITE_TELECHARGEMENT = 365 * DAY;

export type CommandesDeps = {
  db: Db;
  stripe: Stripe | null;
  webhookSecret?: string;
  taxRateId?: string;
  sendMail: SendMail;
  publicUrl: string;
  now: () => number;
  queue: PQueue;
  guard: Guard;
  pdfDir: string;
  adminEmail?: string;
  retryMs?: number;
  analyser?: AnalyseSite;
  pdf?: (r: SiteReport, lienDevis?: string) => Promise<Buffer>;
};

const hote = (url: string) => new URL(url).hostname.replace(/^www\./, '');
const masquer = (email: string) => email.replace(/^(.)[^@]*/, '$1•••');

export async function commandes(app: FastifyInstance, deps: CommandesDeps) {
  const { db, stripe, sendMail, publicUrl, now, queue, guard, pdfDir } = deps;
  const analyser = deps.analyser ?? analyserSite;
  const genererPdf = deps.pdf ?? renderPdf;
  const retryMs = deps.retryMs ?? 15 * 60_000;
  const progression = new Map<string, { fait: number; total: number }>();
  const timers = new Set<NodeJS.Timeout>();

  // ─── Delivery pipeline ──────────────────────────────────────
  function planifier(id: string, delai = 0) {
    const lancer = () => void queue.add(() => livrer(id), { priority: 1 }); // paid before free scans
    if (!delai) return lancer();
    const t = setTimeout(() => {
      timers.delete(t);
      lancer();
    }, delai);
    t.unref();
    timers.add(t);
  }

  async function livrer(id: string) {
    const commande = await db.select().from(orders).where(eq(orders.id, id)).get();
    if (!commande || (commande.status !== 'paid' && commande.status !== 'processing')) return;
    const essai = commande.attempts + 1;
    await db.update(orders).set({ status: 'processing', attempts: essai }).where(eq(orders.id, id));
    const site = hote(commande.url);

    let pdf: Buffer;
    try {
      progression.set(id, { fait: 0, total: 1 });
      const pages = await analyser(new URL(commande.url), { guard, onProgress: (fait, total) => progression.set(id, { fait, total }) });
      const lienDevis = `${publicUrl}/faire-corriger${commande.scanId ? `?scan=${commande.scanId}` : ''}`;
      pdf = await genererPdf(buildSiteReport(pages), lienDevis);
      await mkdir(pdfDir, { recursive: true });
      const pdfPath = join(pdfDir, `${id}.pdf`);
      await writeFile(pdfPath, pdf);
      await db.update(orders).set({ status: 'ready', pdfPath, readyAt: new Date(now()) }).where(eq(orders.id, id));
    } catch (e) {
      app.log.error({ err: e, commande: id, essai }, 'livraison en échec');
      if (essai < MAX_ESSAIS) {
        await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, id));
        return planifier(id, retryMs);
      }
      return abandonner(commande, site, (e as Error).message);
    } finally {
      progression.delete(id);
    }

    // The PDF is ready and downloadable from the order page even if this e-mail fails.
    const joint = pdf.length <= MAX_PIECE_JOINTE;
    await sendMail({
      to: commande.email,
      ...livraisonEmail({ site, telechargement: `${publicUrl}/api/commandes/telechargement/${commande.downloadToken}`, joint }),
      attachments: joint ? [{ filename: `rapport-accessibilite-${site}.pdf`, content: pdf, contentType: 'application/pdf' }] : undefined,
    }).catch((e) => app.log.error(e));
  }

  async function abandonner(commande: typeof orders.$inferSelect, site: string, erreur: string) {
    let rembourse = false;
    if (stripe && commande.paymentIntent) {
      try {
        await stripe.refunds.create({ payment_intent: commande.paymentIntent }, { idempotencyKey: `refund-${commande.id}` });
        rembourse = true;
      } catch (e) {
        app.log.error(e);
      }
    }
    await db.update(orders).set({ status: rembourse ? 'refunded' : 'failed' }).where(eq(orders.id, commande.id));
    await sendMail({ to: commande.email, ...excusesEmail({ site, rembourse }) }).catch((e) => app.log.error(e));
    if (deps.adminEmail) {
      await sendMail({ to: deps.adminEmail, ...alerteAdmin({ commande: commande.id, site, erreur, rembourse }) }).catch((e) => app.log.error(e));
    }
  }

  // Orders interrupted by a restart start again.
  for (const c of await db.select().from(orders).where(inArray(orders.status, ['paid', 'processing']))) planifier(c.id);

  app.addHook('onClose', async () => timers.forEach(clearTimeout));

  // ─── Routes ─────────────────────────────────────────────────
  app.get('/api/offre', async () => ({ libelle: OFFRE.libelle, disponible: !!stripe }));

  app.post<{ Params: { id: string } }>(
    '/api/scan/:id/commande',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      if (!stripe) {
        return reply.code(503).send({ error: 'paiement', message: "Le paiement en ligne n'est pas encore disponible. Réessayez plus tard." });
      }
      const scan = await db.select().from(scans).where(eq(scans.id, req.params.id)).get();
      if (!scan?.report) return reply.code(404).send({ error: 'not_found', message: 'Ce rapport est introuvable ou a expiré.' });
      try {
        const session = await creerSession(stripe, { scanId: scan.id, site: hote(scan.url), publicUrl, taxRateId: deps.taxRateId });
        return { url: session.url };
      } catch (e) {
        req.log.error(e);
        return reply.code(502).send({ error: 'paiement', message: 'Le service de paiement ne répond pas. Réessayez dans quelques instants.' });
      }
    },
  );

  // Stripe signs the raw body: JSON parsing is replaced in this scope only.
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    scope.post('/api/stripe/webhook', async (req, reply) => {
      if (!stripe || !deps.webhookSecret) return reply.code(503).send({ error: 'paiement' });
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body as Buffer, String(req.headers['stripe-signature'] ?? ''), deps.webhookSecret);
      } catch {
        return reply.code(400).send({ error: 'signature' });
      }
      if (await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id)).get()) return { recu: true };
      await db.insert(stripeEvents).values({ id: event.id, receivedAt: new Date(now()) });

      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const s = event.data.object;
        const scanId = s.metadata?.scanId;
        const scan = scanId ? await db.select().from(scans).where(eq(scans.id, scanId)).get() : undefined;
        const dejaLa = await db.select().from(orders).where(eq(orders.stripeSessionId, s.id)).get();
        if (s.payment_status === 'paid' && scan && !dejaLa) {
          const id = randomUUID();
          await db.insert(orders).values({
            id,
            stripeSessionId: s.id,
            scanId: scan.id,
            url: scan.url,
            email: s.customer_details?.email ?? '',
            amountTotal: s.amount_total ?? 0,
            currency: s.currency ?? OFFRE.devise,
            paymentIntent: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null),
            status: 'paid',
            downloadToken: randomBytes(24).toString('base64url'),
            createdAt: new Date(now()),
          });
          planifier(id);
        }
      }
      return { recu: true };
    });
  });

  app.get<{ Params: { session: string } }>('/api/commandes/:session', async (req, reply) => {
    const c = await db.select().from(orders).where(eq(orders.stripeSessionId, req.params.session)).get();
    // Not an error for the customer: the webhook may arrive a few seconds after the redirect.
    if (!c) return reply.code(404).send({ error: 'pending', message: 'Nous attendons la confirmation de votre paiement.' });
    return {
      statut: c.status,
      site: hote(c.url),
      email: masquer(c.email),
      progression: progression.get(c.id) ?? null,
      telechargement: c.status === 'ready' ? `/api/commandes/telechargement/${c.downloadToken}` : null,
    };
  });

  app.get<{ Params: { token: string } }>('/api/commandes/telechargement/:token', async (req, reply) => {
    const c = await db.select().from(orders).where(eq(orders.downloadToken, req.params.token)).get();
    if (!c || c.status !== 'ready' || !c.pdfPath) return reply.code(404).send({ error: 'not_found', message: 'Ce rapport est introuvable.' });
    if (c.readyAt && now() - c.readyAt.getTime() > VALIDITE_TELECHARGEMENT) {
      return reply.code(410).send({ error: 'expired', message: 'Ce lien de téléchargement a expiré (12 mois).' });
    }
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="rapport-accessibilite-${hote(c.url)}.pdf"`)
      .header('cache-control', 'private, no-store')
      .send(createReadStream(c.pdfPath));
  });

  return {
    /** 12 months, like free reports: PDF file and order row. Stripe keeps the invoices (accounting). */
    async purger(t: number) {
      const vieilles = await db.select().from(orders).where(lt(orders.createdAt, new Date(t - VALIDITE_TELECHARGEMENT)));
      for (const c of vieilles) if (c.pdfPath) await rm(c.pdfPath, { force: true });
      await db.delete(orders).where(lt(orders.createdAt, new Date(t - VALIDITE_TELECHARGEMENT)));
      await db.delete(stripeEvents).where(lt(stripeEvents.receivedAt, new Date(t - 30 * DAY)));
    },
  };
}
