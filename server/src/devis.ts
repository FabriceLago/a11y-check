import { randomUUID } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from './db.js';
import type { SendMail } from './mailer.js';
import { BESOINS, BUDGETS, DELAIS, devis, OUTILS, scans } from './schema.js';
import { emailSimple, lien, texte } from './templates.js';

const DAY = 86_400_000;
export const RETENTION_DEVIS = 3 * 365 * DAY;
export const DELAI_REPONSE = '2 jours ouvrables';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const LIBELLES = {
  outil: { wordpress: 'WordPress', wix: 'Wix', shopify: 'Shopify', autre: 'Autre outil', inconnu: 'Je ne sais pas' },
  besoins: {
    critiques: 'Corriger les problèmes critiques',
    tout: 'Corriger tous les problèmes du rapport',
    audit: 'Un audit manuel complet',
    accompagnement: 'Un accompagnement dans la durée',
  },
  delai: { urgent: 'Le plus vite possible', '3-mois': 'Dans les 3 mois', '6-mois': 'Dans les 6 mois', flexible: 'Pas de délai particulier' },
  budget: {
    inconnu: 'Je ne sais pas encore',
    'moins-500': 'Moins de 500 €',
    '500-1500': 'De 500 à 1 500 €',
    '1500-5000': 'De 1 500 à 5 000 €',
    'plus-5000': 'Plus de 5 000 €',
  },
} as const;

type Corps = {
  nom: string;
  entreprise?: string;
  email: string;
  telephone?: string;
  site: string;
  outil: (typeof OUTILS)[number];
  besoins: (typeof BESOINS)[number][];
  delai: (typeof DELAIS)[number];
  budget: (typeof BUDGETS)[number];
  message?: string;
  scanId?: string;
  /** Honeypot: hidden from people (and from assistive tech), bots fill it. */
  siteWeb?: string;
};

/** Required fields and formats, with a French message per field (same rules as the form). */
export function validerDevis(b: Corps): Record<string, string> {
  const erreurs: Record<string, string> = {};
  if (!b.nom.trim()) erreurs.nom = 'Indiquez votre nom.';
  if (!b.email.trim()) erreurs.email = 'Indiquez votre adresse e-mail.';
  else if (!EMAIL_RE.test(b.email.trim())) erreurs.email = 'Cette adresse e-mail ne semble pas valide. Exemple : prenom@entreprise.be';
  if (!b.site.trim()) erreurs.site = "Indiquez l'adresse de votre site.";
  if (!b.besoins.length) erreurs.besoins = 'Choisissez au moins une option.';
  return erreurs;
}

const chaine = (max: number) => ({ type: 'string', maxLength: max });

export async function devisRoutes(app: FastifyInstance, deps: { db: Db; sendMail: SendMail; publicUrl: string; now: () => number; adminEmail?: string }) {
  const { db, sendMail, publicUrl, now, adminEmail } = deps;

  app.post<{ Body: Corps }>(
    '/api/devis',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
      schema: {
        body: {
          type: 'object',
          required: ['nom', 'email', 'site', 'outil', 'besoins', 'delai', 'budget'],
          additionalProperties: false,
          properties: {
            nom: chaine(100),
            entreprise: chaine(150),
            email: chaine(254),
            telephone: chaine(30),
            site: chaine(2048),
            outil: { enum: [...OUTILS] },
            besoins: { type: 'array', items: { enum: [...BESOINS] }, uniqueItems: true, maxItems: BESOINS.length },
            delai: { enum: [...DELAIS] },
            budget: { enum: [...BUDGETS] },
            message: chaine(3000),
            scanId: chaine(64),
            siteWeb: chaine(2048),
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const MERCI = { message: `Merci ! Nous avons bien reçu votre demande et vous répondons sous ${DELAI_REPONSE}.` };
      if (b.siteWeb) return reply.code(202).send(MERCI); // bot: pretend it worked, store nothing

      const erreurs = validerDevis(b);
      if (Object.keys(erreurs).length) return reply.code(400).send({ error: 'validation', message: 'Certains champs sont à corriger.', champs: erreurs });

      const scan = b.scanId ? await db.select().from(scans).where(eq(scans.id, b.scanId)).get() : undefined;
      const demande = {
        id: randomUUID(),
        nom: b.nom.trim(),
        entreprise: b.entreprise?.trim() || null,
        email: b.email.trim().toLowerCase(),
        telephone: b.telephone?.trim() || null,
        site: b.site.trim(),
        outil: b.outil,
        besoins: b.besoins,
        delai: b.delai,
        budget: b.budget,
        message: b.message?.trim() || null,
        scanId: scan?.id ?? null,
        createdAt: new Date(now()),
      };
      await db.insert(devis).values(demande);

      const recap = [
        `Site : ${demande.site}`,
        `Outil : ${LIBELLES.outil[demande.outil]}`,
        `Besoins : ${demande.besoins.map((x) => LIBELLES.besoins[x]).join(', ')}`,
        `Délai : ${LIBELLES.delai[demande.delai]}`,
        `Budget : ${LIBELLES.budget[demande.budget]}`,
      ];

      if (adminEmail) {
        const rapport = scan?.report;
        await sendMail({
          to: adminEmail,
          ...emailSimple(`Nouvelle demande de devis : ${demande.site} (${demande.nom})`, [
            texte(`${demande.nom}${demande.entreprise ? `, ${demande.entreprise}` : ''} · ${demande.email}${demande.telephone ? ` · ${demande.telephone}` : ''}`),
            ...recap.map(texte),
            ...(demande.message ? [texte(`Message : ${demande.message}`)] : []),
            ...(rapport
              ? [
                  texte(`Rapport gratuit : ${rapport.score}/100 (${rapport.palier}), ${rapport.problemes.length} problème(s) : ${rapport.problemes.map((p) => `${p.titre} [${p.priorite}]`).join(' ; ')}.`),
                  lien(`${publicUrl}/analyse/${scan!.id}`, 'Voir le rapport'),
                ]
              : []),
            texte(`À traiter sous ${DELAI_REPONSE}.`),
          ]),
        }).catch((e) => app.log.error(e));
      } else {
        app.log.warn({ devis: demande.id }, 'ADMIN_EMAIL absent : demande de devis enregistrée sans notification');
      }

      await sendMail({
        to: demande.email,
        ...emailSimple('Nous avons bien reçu votre demande de devis', [
          texte(`Bonjour ${demande.nom},`),
          texte(`Merci pour votre demande concernant ${demande.site}. Nous l'étudions et vous répondons sous ${DELAI_REPONSE}.`),
          texte('Pour rappel :'),
          ...recap.map(texte),
          texte("Vous n'avez rien d'autre à faire pour l'instant."),
        ]),
      }).catch((e) => app.log.error(e));

      return reply.code(202).send(MERCI);
    },
  );

  return {
    purger: (t: number) => db.delete(devis).where(lt(devis.createdAt, new Date(t - RETENTION_DEVIS))),
  };
}
