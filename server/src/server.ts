import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { pathToFileURL } from 'node:url';
import rateLimit from '@fastify/rate-limit';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import PQueue from 'p-queue';
import type Stripe from 'stripe';
import { commandes, type CommandesDeps } from './commandes.js';
import { openDb, type Db } from './db.js';
import { devisRoutes } from './devis.js';
import { sauvegarderBase } from './sauvegardes.js';
import { creerStripe } from './paiement.js';
import { createMailer, type SendMail } from './mailer.js';
import { buildReport, freeView } from './report.js';
import { closeBrowser, scan, ScanError } from './scan.js';
import { leads, scans } from './schema.js';
import { assertPublicHost, parsePublicUrl, UnsafeUrlError, type Guard } from './ssrf.js';
import { esc, page, rapportEmail } from './templates.js';

/** Shown next to the checkbox; stored with each consent. Change the version whenever the text changes. */
export const CONSENTEMENT = {
  version: '2026-09-27',
  texte: "J'accepte de recevoir vos conseils et offres par e-mail (1 à 2 par mois). Je peux me désinscrire en un clic.",
};

const DAY = 86_400_000;
export const RETENTION = { scans: 365 * DAY, leads: 3 * 365 * DAY, confirmation: 7 * DAY };
const MAX_QUEUED = 20;
// Deliberately simple: the real check is that the e-mail arrives.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Only queued/running scans live in memory; finished ones are in SQLite. */
type LiveJob = { id: string; url: string; status: 'queued' | 'running'; steps: string[]; createdAt: number };

export type ServerOptions = {
  guard?: Guard;
  scanFn?: typeof scan;
  rateLimitMax?: number;
  logger?: boolean;
  dbFile?: string;
  sendMail?: SendMail;
  publicUrl?: string;
  now?: () => number;
  /** Phase 5 (paid report). Defaults come from STRIPE_* / ADMIN_EMAIL / PDF_DIR. */
  stripe?: Stripe | null;
  webhookSecret?: string;
  taxRateId?: string;
  adminEmail?: string;
  pdfDir?: string;
  retryMs?: number;
  analyser?: CommandesDeps['analyser'];
  pdf?: CommandesDeps['pdf'];
  /** Deployment: daily SQLite backups here (BACKUP_DIR), built Angular app served from here (WEB_DIR). */
  backupDir?: string;
  webDir?: string;
};

const ACTIONS = {
  confirmer: {
    titre: 'Confirmer votre inscription',
    question: 'Confirmez-vous vouloir recevoir nos conseils et offres par e-mail (1 à 2 par mois) ? Vous pourrez vous désinscrire en un clic.',
    bouton: 'Je confirme',
  },
  desinscrire: {
    titre: 'Ne plus recevoir nos conseils',
    question: 'Vous ne recevrez plus nos conseils et offres par e-mail.',
    bouton: 'Me désinscrire',
  },
  supprimer: {
    titre: 'Supprimer vos données',
    question: 'Votre adresse e-mail et l\'historique de votre consentement seront définitivement supprimés.',
    bouton: 'Supprimer mes données',
  },
} as const;
type Action = keyof typeof ACTIONS;

/** Explicit: Fastify instances are thenable, so Awaited<> would strip the extra fields. */
export type App = FastifyInstance & { db: Db; purge: () => Promise<void> };

export async function buildServer({
  guard = {},
  scanFn = scan,
  rateLimitMax = 5,
  logger = true,
  dbFile = ':memory:',
  sendMail = createMailer(),
  publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:4200',
  now = Date.now,
  stripe = creerStripe(),
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  taxRateId = process.env.STRIPE_TAX_RATE_ID,
  adminEmail = process.env.ADMIN_EMAIL,
  pdfDir = process.env.PDF_DIR ?? 'data/pdf',
  retryMs,
  analyser,
  pdf,
  backupDir = process.env.BACKUP_DIR,
  webDir = process.env.WEB_DIR,
}: ServerOptions = {}): Promise<App> {
  const app = Fastify({ logger, trustProxy: process.env.TRUST_PROXY === '1' });
  const { db, close, migrate, sauvegarder } = openDb(dbFile);
  await migrate();
  // A restart kills the browser: scans that were in progress cannot resume.
  await db.update(scans).set({ status: 'error', error: "L'analyse a été interrompue. Relancez-la." }).where(inArray(scans.status, ['queued', 'running']));

  const live = new Map<string, LiveJob>();
  const queue = new PQueue({ concurrency: 2 });

  const purgeurs: ((t: number) => Promise<unknown>)[] = []; // filled by the plugins below
  const purge = async () => {
    const t = now();
    for (const p of purgeurs) await p(t);
    await db.delete(scans).where(lt(scans.createdAt, new Date(t - RETENTION.scans)));
    await db.delete(leads).where(lt(leads.lastContactAt, new Date(t - RETENTION.leads)));
    await db
      .update(leads)
      .set({ marketingConsent: 'none' })
      .where(and(eq(leads.marketingConsent, 'pending'), lt(leads.consentRequestedAt, new Date(t - RETENTION.confirmation))));
  };

  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    await queue.onIdle();
    await closeBrowser();
    close();
  });

  // HTML forms on the e-mail link pages post an empty urlencoded body.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, _body, done) => done(null, {}));

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'rate_limited',
      message: `Vous avez atteint la limite de ${ctx.max} demandes par heure. Réessayez dans ${ctx.after}.`,
    }),
  });

  // Paid report: Stripe Checkout, webhook, delivery (after rate-limit, which its routes use).
  const cmd = await commandes(app, { db, stripe, webhookSecret, taxRateId, sendMail, publicUrl, now, queue, guard, pdfDir, adminEmail, retryMs, analyser, pdf });
  purgeurs.push(cmd.purger);
  const dev = await devisRoutes(app, { db, sendMail, publicUrl, now, adminEmail });
  purgeurs.push(dev.purger);
  // Daily tasks run at start-up then every 24 h: purges above, then the backup.
  if (backupDir) purgeurs.push((t) => sauvegarderBase(sauvegarder, backupDir, t));
  await purge();

  // Docker healthcheck: the process answers AND the database responds.
  app.get('/api/sante', async (_req, reply) => {
    try {
      await db.run(sql`select 1`);
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  const purgeTimer = setInterval(() => purge().catch((e) => app.log.error(e)), DAY).unref();

  // ─── Scans ──────────────────────────────────────────────────
  app.post<{ Body: { url: string } }>(
    '/api/scan',
    {
      config: { rateLimit: { max: rateLimitMax, timeWindow: '1 hour' } },
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          additionalProperties: false,
          properties: { url: { type: 'string', minLength: 1, maxLength: 2048 } },
        },
      },
    },
    async (req, reply) => {
      let url: URL;
      try {
        url = parsePublicUrl(req.body.url, guard);
        await assertPublicHost(url.hostname, guard);
      } catch (e) {
        if (e instanceof UnsafeUrlError) return reply.code(400).send({ error: e.reason, message: e.message });
        throw e;
      }
      if (queue.size >= MAX_QUEUED) {
        return reply.code(503).send({ error: 'busy', message: 'Beaucoup d’analyses sont en cours. Réessayez dans quelques minutes.' });
      }

      const job: LiveJob = { id: randomUUID(), url: url.href, status: 'queued', steps: [], createdAt: now() };
      live.set(job.id, job);
      await db.insert(scans).values({ id: job.id, url: job.url, status: 'queued', createdAt: new Date(job.createdAt) });

      queue.add(async () => {
        job.status = 'running';
        try {
          const result = await scanFn(url, { guard, onStep: (m) => job.steps.push(m) });
          await db.update(scans).set({ status: 'done', result, report: buildReport(result) }).where(eq(scans.id, job.id));
        } catch (e) {
          const known = e instanceof ScanError || e instanceof UnsafeUrlError;
          if (!known) req.log.error(e);
          const error = known ? (e as Error).message : "L'analyse a échoué. Réessayez plus tard.";
          await db.update(scans).set({ status: 'error', error }).where(eq(scans.id, job.id));
        } finally {
          live.delete(job.id);
        }
      });
      return reply.code(202).send({ id: job.id });
    },
  );

  app.get<{ Params: { id: string } }>('/api/scan/:id', async (req, reply) => {
    const job = live.get(req.params.id);
    if (job) {
      const position = job.status === 'queued'
        ? [...live.values()].filter((j) => j.status === 'queued' && j.createdAt <= job.createdAt).length
        : 0;
      return { id: job.id, url: job.url, status: job.status, steps: job.steps, position };
    }
    const row = await db.select().from(scans).where(eq(scans.id, req.params.id)).get();
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'Cette analyse est introuvable ou a expiré.' });
    return {
      id: row.id,
      url: row.url,
      status: row.status,
      steps: [],
      position: 0,
      error: row.error ?? undefined,
      report: row.report ? freeView(row.report) : undefined,
    };
  });

  // ─── Report by e-mail + consent ─────────────────────────────
  app.get('/api/consentement', async () => CONSENTEMENT);

  app.post<{ Params: { id: string }; Body: { email: string; conseils: boolean; consentVersion?: string } }>(
    '/api/scan/:id/email',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'conseils'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 254 },
            conseils: { type: 'boolean' },
            consentVersion: { type: 'string', maxLength: 32 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: 'email', message: 'Cette adresse e-mail ne semble pas valide. Exemple : prenom@entreprise.be' });
      }
      const { conseils } = req.body;
      if (conseils && req.body.consentVersion !== CONSENTEMENT.version) {
        return reply.code(400).send({ error: 'consent', message: 'Le texte de consentement a changé. Rechargez la page et réessayez.' });
      }
      const scanRow = await db.select().from(scans).where(eq(scans.id, req.params.id)).get();
      if (!scanRow?.report) return reply.code(404).send({ error: 'not_found', message: 'Ce rapport est introuvable ou a expiré.' });

      const t = new Date(now());
      const existing = await db.select().from(leads).where(eq(leads.email, email)).get();
      const token = existing?.token ?? randomBytes(24).toString('base64url');
      // Unticked box never withdraws an earlier consent; a ticked one (re)starts the double opt-in.
      const demandeConseils = conseils && existing?.marketingConsent !== 'confirmed';
      const consent = demandeConseils
        ? { marketingConsent: 'pending' as const, consentText: CONSENTEMENT.texte, consentVersion: CONSENTEMENT.version, consentRequestedAt: t }
        : {};
      await db
        .insert(leads)
        .values({ id: randomUUID(), email, scanId: scanRow.id, token, marketingConsent: 'none', createdAt: t, lastContactAt: t, ...consent })
        .onConflictDoUpdate({ target: leads.email, set: { scanId: scanRow.id, lastContactAt: t, ...consent } });

      const etat = demandeConseils ? 'pending' : (existing?.marketingConsent ?? 'none');
      const lien = (action: Action) => `${publicUrl}/api/leads/${token}/${action}`;
      const mail = rapportEmail(scanRow.report, {
        rapport: `${publicUrl}/analyse/${scanRow.id}`,
        supprimer: lien('supprimer'),
        confirmer: etat === 'pending' ? lien('confirmer') : undefined,
        desinscrire: etat === 'pending' || etat === 'confirmed' ? lien('desinscrire') : undefined,
      });
      try {
        await sendMail({ to: email, ...mail });
      } catch (e) {
        req.log.error(e);
        return reply.code(502).send({ error: 'mail', message: "L'e-mail n'a pas pu être envoyé. Réessayez dans quelques minutes." });
      }
      return reply.code(202).send({
        message: demandeConseils
          ? "C'est envoyé ! Vérifiez votre boîte de réception : un lien vous permettra aussi de confirmer votre inscription à nos conseils."
          : "C'est envoyé ! Vérifiez votre boîte de réception (et, au besoin, le dossier des indésirables).",
      });
    },
  );

  // ─── Links from the e-mail: GET shows a confirmation page, POST acts ─
  // (GET never changes anything: mail scanners follow links automatically.)
  const lienInvalide = page('Ce lien n’est plus valide', `<p>Ce lien a expiré ou vos données ont déjà été supprimées.</p><p><a href="${esc(publicUrl)}/">Retour au site</a></p>`, 404);
  const envoyerPage = (reply: FastifyReply, p: ReturnType<typeof page>) =>
    reply.code(p.status).type('text/html; charset=utf-8').send(p.html);

  app.get<{ Params: { token: string; action: string } }>('/api/leads/:token/:action', async (req, reply) => {
    const action = ACTIONS[req.params.action as Action];
    const lead = action && (await db.select().from(leads).where(eq(leads.token, req.params.token)).get());
    if (!lead) return envoyerPage(reply, lienInvalide);
    return envoyerPage(
      reply,
      page(action.titre, `<p>${esc(action.question)}</p><form method="post"><button type="submit">${esc(action.bouton)}</button></form><p><a href="${esc(publicUrl)}/">Retour au site</a></p>`),
    );
  });

  app.post<{ Params: { token: string; action: string } }>('/api/leads/:token/:action', async (req, reply) => {
    const action = req.params.action as Action;
    const lead = ACTIONS[action] && (await db.select().from(leads).where(eq(leads.token, req.params.token)).get());
    if (!lead) return envoyerPage(reply, lienInvalide);
    const t = new Date(now());
    const retour = `<p><a href="${esc(publicUrl)}/">Retour au site</a></p>`;

    if (action === 'supprimer') {
      await db.delete(leads).where(eq(leads.id, lead.id));
      return envoyerPage(reply, page('Vos données ont été supprimées', `<p>Votre adresse e-mail et l'historique de votre consentement ont été définitivement effacés.</p>${retour}`));
    }
    if (action === 'desinscrire') {
      await db.update(leads).set({ marketingConsent: 'withdrawn', consentWithdrawnAt: t, lastContactAt: t }).where(eq(leads.id, lead.id));
      return envoyerPage(reply, page('Vous êtes désinscrit', `<p>Vous ne recevrez plus nos conseils et offres. Vous pouvez aussi <a href="${esc(publicUrl)}/api/leads/${esc(lead.token)}/supprimer">supprimer toutes vos données</a>.</p>${retour}`));
    }
    // confirmer
    if (lead.marketingConsent === 'confirmed') {
      return envoyerPage(reply, page('Inscription déjà confirmée', `<p>Votre inscription à nos conseils était déjà confirmée.</p>${retour}`));
    }
    if (lead.marketingConsent !== 'pending') {
      return envoyerPage(reply, page('Ce lien de confirmation a expiré', `<p>Vous pouvez refaire la demande depuis un rapport, en cochant la case correspondante.</p>${retour}`, 410));
    }
    await db.update(leads).set({ marketingConsent: 'confirmed', consentConfirmedAt: t, lastContactAt: t }).where(eq(leads.id, lead.id));
    return envoyerPage(reply, page('Merci, votre inscription est confirmée', `<p>Vous recevrez nos conseils 1 à 2 fois par mois. Chaque e-mail contient un lien pour vous désinscrire.</p>${retour}`));
  });

  // Production: the same server serves the built Angular app (same origin, no CORS, no proxy).
  if (webDir && existsSync(join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: resolve(webDir),
      setHeaders: (res, fichier) => {
        // Hashed bundles never change; index.html must always be revalidated to pick up new releases.
        res.header('cache-control', /-[A-Z0-9]{8}\.(js|css)$/.test(fichier) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    // Angular routes (/analyse/…, /faire-corriger…) are client-side: serve index.html; unknown /api stays a 404.
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api/')
        ? reply.header('cache-control', 'no-cache').sendFile('index.html')
        : reply.code(404).send({ error: 'not_found', message: 'Introuvable.' }),
    );
  }

  // Cast: TS unwraps thenables returned from async functions (runtime is fine, see App).
  return Object.assign(app, { db, purge }) as unknown as Awaited<App> & App;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await buildServer({ dbFile: process.env.DB_FILE ?? 'data/a11y.db' });
  // `docker stop` sends SIGTERM: finish running scans, close the browser and the database cleanly.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'arrêt en cours');
      app.close().then(() => process.exit(0), () => process.exit(1));
    });
  }
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
}
