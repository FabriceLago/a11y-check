import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validerDevis } from '../src/devis.js';
import type { Mail } from '../src/mailer.js';
import { devis } from '../src/schema.js';
import { buildServer, type App } from '../src/server.js';

const PUBLIC_URL = 'https://93.184.215.14/';
const pass = {
  title: 'Accueil',
  violations: [{ id: 'image-alt', impact: 'critical', tags: ['wcag111'], nodes: [{ target: ['img'], html: '<img>' }], nodeCount: 1 }],
  incomplete: [],
  checks: { skipLink: { found: true, text: 'Aller au contenu' }, videos: { native: [], embeds: [] } },
};
const fakeScan = (async (url: URL) =>
  ({ url: url.href, finalUrl: url.href, scannedAt: '2026-09-27T10:00:00.000Z', desktop: pass, mobile: pass, blockedRequests: [] }) as never) as never;

const DEMANDE = {
  nom: 'Marie Dupont',
  entreprise: 'Boulangerie Dupont',
  email: 'Marie@Exemple.be',
  telephone: '+32 470 12 34 56',
  site: 'boulangerie-dupont.be',
  outil: 'wordpress',
  besoins: ['critiques', 'audit'],
  delai: '3-mois',
  budget: 'inconnu',
  message: 'Nous voulons être prêts avant les fêtes.',
};

let app: App;
let mails: Mail[];
const envoyer = (payload: object) => app.inject({ method: 'POST', url: '/api/devis', payload });

beforeEach(async () => {
  mails = [];
  app = await buildServer({ scanFn: fakeScan, logger: false, sendMail: async (m) => void mails.push(m), adminEmail: 'admin@outil.example', publicUrl: 'https://outil.example', stripe: null });
});
afterEach(() => app.close());

describe('validerDevis', () => {
  it('lists every missing field with a French message', () => {
    expect(validerDevis({ ...DEMANDE, nom: ' ', email: '', site: '', besoins: [] } as never)).toEqual({
      nom: 'Indiquez votre nom.',
      email: 'Indiquez votre adresse e-mail.',
      site: "Indiquez l'adresse de votre site.",
      besoins: 'Choisissez au moins une option.',
    });
  });
});

describe('POST /api/devis', () => {
  it('stores the request, notifies the admin and confirms to the customer with the 2-day promise', async () => {
    const res = await envoyer(DEMANDE);
    expect(res.statusCode).toBe(202);
    expect(res.json().message).toContain('2 jours ouvrables');

    const [ligne] = await app.db.select().from(devis).all();
    expect(ligne).toMatchObject({ nom: 'Marie Dupont', email: 'marie@exemple.be', besoins: ['critiques', 'audit'], budget: 'inconnu', scanId: null });

    const admin = mails.find((m) => m.to === 'admin@outil.example')!;
    expect(admin.subject).toBe('Nouvelle demande de devis : boulangerie-dupont.be (Marie Dupont)');
    expect(admin.text).toContain('Besoins : Corriger les problèmes critiques, Un audit manuel complet');
    expect(admin.text).toContain('Nous voulons être prêts avant les fêtes.');

    const client = mails.find((m) => m.to === 'marie@exemple.be')!;
    expect(client.text).toContain('sous 2 jours ouvrables');
    expect(client.html).toContain('<html lang="fr">');
  });

  it('attaches the free report summary when the request comes from a report', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/scan', payload: { url: PUBLIC_URL } })).json();
    for (let i = 0; i < 100 && (await app.inject({ method: 'GET', url: `/api/scan/${id}` })).json().status !== 'done'; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    await envoyer({ ...DEMANDE, scanId: id });
    const admin = mails.find((m) => m.to === 'admin@outil.example')!;
    expect(admin.text).toContain('Rapport gratuit : 85/100');
    expect(admin.text).toContain("Certaines images n'ont pas de description [Critique]");
    expect(admin.text).toContain(`https://outil.example/analyse/${id}`);
  });

  it('returns field errors in French', async () => {
    const res = await envoyer({ ...DEMANDE, email: 'marie@', besoins: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json().champs).toEqual({ email: expect.stringContaining('ne semble pas valide'), besoins: 'Choisissez au moins une option.' });
    expect(await app.db.select().from(devis).all()).toHaveLength(0);
  });

  it('silently drops bots that fill the honeypot', async () => {
    const res = await envoyer({ ...DEMANDE, siteWeb: 'http://spam.example' });
    expect(res.statusCode).toBe(202); // the bot believes it worked
    expect(await app.db.select().from(devis).all()).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it('limits requests to 3 per hour', async () => {
    for (let i = 0; i < 3; i++) expect((await envoyer(DEMANDE)).statusCode).toBe(202);
    expect((await envoyer(DEMANDE)).statusCode).toBe(429);
  });

  it('rejects unknown choices', async () => {
    expect((await envoyer({ ...DEMANDE, budget: 'un million' })).statusCode).toBe(400);
  });
});
