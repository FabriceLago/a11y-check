import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { FullReport } from './report.js';
import type { ScanResult } from './scan.js';

const ms = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  status: text('status', { enum: ['queued', 'running', 'done', 'error'] }).notNull(),
  error: text('error'),
  /** Raw scan and full report stay server-side: the paid PDF is built from them. */
  result: text('result', { mode: 'json' }).$type<ScanResult>(),
  report: text('report', { mode: 'json' }).$type<FullReport>(),
  createdAt: ms('created_at').notNull(),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  stripeSessionId: text('stripe_session_id').notNull().unique(),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'set null' }),
  /** Copied from the scan: the order must still know the site if the scan row is gone. */
  url: text('url').notNull(),
  email: text('email').notNull(),
  amountTotal: integer('amount_total').notNull(),
  currency: text('currency').notNull(),
  paymentIntent: text('payment_intent'),
  status: text('status', { enum: ['paid', 'processing', 'ready', 'failed', 'refunded'] }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  pdfPath: text('pdf_path'),
  /** Secret for the download link (never the order id). */
  downloadToken: text('download_token').notNull().unique(),
  createdAt: ms('created_at').notNull(),
  readyAt: ms('ready_at'),
});

/** Stripe may deliver the same event twice: remember what was already handled. */
export const stripeEvents = sqliteTable('stripe_events', {
  id: text('id').primaryKey(),
  receivedAt: ms('received_at').notNull(),
});

export const OUTILS = ['wordpress', 'wix', 'shopify', 'autre', 'inconnu'] as const;
export const BESOINS = ['critiques', 'tout', 'audit', 'accompagnement'] as const;
export const DELAIS = ['urgent', '3-mois', '6-mois', 'flexible'] as const;
export const BUDGETS = ['inconnu', 'moins-500', '500-1500', '1500-5000', 'plus-5000'] as const;

/** "Faire corriger mon site" requests. Legal basis: the request itself (pre-contractual). */
export const devis = sqliteTable('devis', {
  id: text('id').primaryKey(),
  nom: text('nom').notNull(),
  entreprise: text('entreprise'),
  email: text('email').notNull(),
  telephone: text('telephone'),
  site: text('site').notNull(),
  outil: text('outil', { enum: OUTILS }).notNull(),
  besoins: text('besoins', { mode: 'json' }).$type<(typeof BESOINS)[number][]>().notNull(),
  delai: text('delai', { enum: DELAIS }).notNull(),
  budget: text('budget', { enum: BUDGETS }).notNull(),
  message: text('message'),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'set null' }),
  createdAt: ms('created_at').notNull(),
});

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'set null' }),
  /** Secret for the confirm / unsubscribe / delete links (no account needed). */
  token: text('token').notNull().unique(),
  /** Double opt-in: pending until the link in the e-mail is clicked. */
  marketingConsent: text('marketing_consent', { enum: ['none', 'pending', 'confirmed', 'withdrawn'] }).notNull(),
  /** Proof of consent (GDPR art. 7.1): the exact wording shown, its version, the dates. */
  consentText: text('consent_text'),
  consentVersion: text('consent_version'),
  consentRequestedAt: ms('consent_requested_at'),
  consentConfirmedAt: ms('consent_confirmed_at'),
  consentWithdrawnAt: ms('consent_withdrawn_at'),
  createdAt: ms('created_at').notNull(),
  lastContactAt: ms('last_contact_at').notNull(),
});
