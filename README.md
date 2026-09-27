# a11y-check (nom provisoire)

Vérificateur d'accessibilité pour PME — phase 1 : API d'analyse.

## Lancer

Deux terminaux :

```bash
cd server
npm install
npx playwright install chromium
npm start            # API sur http://127.0.0.1:3000  (npm run dev = rechargement auto)
```

```bash
cd web
npm install
npm start            # front sur http://localhost:4200 (le proxy renvoie /api vers le serveur)
```

## Tester

```bash
cd server && npm test                 # Vitest : SSRF, analyse, traduction, score, API, e-mails, paiement, PDF,
                                      #   et axe sur les e-mails, les pages des liens et le modèle du PDF
cd web && npm test                    # Angular (Vitest) : tous les écrans et composants
cd web && npm run build && npm run audit:a11y   # axe sur l'app : 57 écrans (clair/sombre, 1280/390 px), API simulée
cd web && npm run audit:a11y:live     # idem sur l'app lancée (API réelle, vrai site analysé)
```

L'intégration continue (`.github/workflows/ci.yml`, GitHub Actions) lance ces trois volets à chaque push.
**Une seule violation axe fait échouer le build** ; le rapport JSON de l'audit est publié comme artefact.

## Déploiement

Docker Compose sur un VPS (Caddy pour le HTTPS, image publiée par la CI sur `ghcr.io/fabricelago/a11y-check`,
sauvegardes quotidiennes de la base, bac à sable de Chromium actif) : voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

## Pages

| Adresse | Rôle |
|---|---|
| `/` | Accueil : champ URL, explication EAA |
| `/analyse/:id` | Attente accessible puis rapport gratuit, questionnaire EAA, e-mail, offre PDF, devis |
| `/commande/:session` | Suivi du rapport payant après Stripe |
| `/faire-corriger` | Demande de devis (`?scan=<id>` relie le rapport ; réponse annoncée sous 2 jours ouvrables) |
| `/design-system` | Documentation des composants, contrastes calculés en direct (publique, `noindex`) |
| `/confidentialite`, `/conditions` | Politique de confidentialité, CGV |

## Test manuel au lecteur d'écran (NVDA ou VoiceOver, 10 min)

Version rapide ci-dessous. Guide complet, écran par écran, avec les annonces attendues : **[docs/TEST-NVDA.md](docs/TEST-NVDA.md)**.

1. Accueil : Tab → « Aller au contenu » est annoncé et visible ; Entrée amène au contenu.
2. Envoyer le champ vide : l'erreur est annoncée, le focus reste dans le champ, le champ est dit « non valide ».
3. Saisir une adresse, Entrée : le titre « Analyse de … en cours » est annoncé.
4. Pendant l'analyse : chaque nouvelle étape est annoncée **une seule fois** (pas de répétition de la liste).
5. Fin : « Résultat pour … » est annoncé ; la touche H (NVDA) parcourt Résumé, À savoir, Points à corriger, puis chaque carte.
6. Le score est lu « Score : 65 sur 100 », suivi du palier.
7. Dans une carte : la priorité est lue en toutes lettres ; « Instructions pour WordPress… » s'ouvre avec Entrée.
8. Zoom navigateur à 200 % puis 400 % : rien n'est coupé, pas de défilement horizontal.
9. Réglages système « réduire les animations » : la barre et la jauge ne bougent plus.
10. Bouton « Thème clair » (le site s'ouvre en sombre) : tout reste lisible, le focus reste visible ; le choix est conservé après rechargement.

## API

- `POST /api/scan` `{ "url": "monsite.be" }` → `202 { id }` (400 si l'adresse est refusée, 429 au-delà de 5/heure/IP)
- `GET /api/scan/:id` → `{ status: queued|running|done|error, position, steps[], report?, error? }`
  - `report` = vue gratuite : score, palier, synthèse, effort total, 5 problèmes prioritaires, `totalProblemes`,
    `pointsAVerifier`, mentions. Le détail complet (sélecteurs, HTML, tous les problèmes) reste côté serveur pour le PDF.

## Traduction et score

- `server/src/rules-fr.ts` : les 70 règles axe lancées, traduites en français clair (+ 3 contrôles maison).
  Un test échoue si axe ajoute une règle non traduite.
- `server/src/report.ts` : priorités, score, effort. Les coefficients sont regroupés en haut du fichier.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | écoute |
| `TRUST_PROXY` | — | `1` derrière un reverse proxy (sinon le rate limit voit l'IP du proxy) |
| `BOT_INFO_URL` | `https://example.invalid/robot` | URL affichée dans le User-Agent du robot |
| `DB_FILE` | `data/a11y.db` | base SQLite (créée et migrée au démarrage) |
| `PUBLIC_URL` | `http://localhost:4200` | adresse du site, utilisée dans les liens des e-mails |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | envoi réel des e-mails (Brevo : `smtp-relay.brevo.com`, port `587`) |
| `MAIL_FROM` | `Vérificateur d'accessibilité <no-reply@example.invalid>` | expéditeur (domaine à authentifier chez Brevo : SPF, DKIM) |
| `MAIL_DIR` | `mails` | sans `SMTP_HOST`, les e-mails sont écrits ici en `.eml` au lieu d'être envoyés |

| `STRIPE_SECRET_KEY` | — | active le rapport payant (`sk_test_…` d'abord) ; sans elle, l'offre est masquée |
| `STRIPE_WEBHOOK_SECRET` | — | secret de signature des webhooks (`whsec_…`) |
| `STRIPE_TAX_RATE_ID` | — | taux de TVA 21 % « inclus » créé dans Stripe (`txr_…`) |
| `ADMIN_EMAIL` | — | reçoit les alertes (commande en échec, remboursement impossible) |
| `PDF_DIR` | `data/pdf` | rapports PDF livrés |

## Rapport payant (Stripe, mode test)

1. Créer un compte Stripe, rester en **mode test**, copier la clé secrète `sk_test_…`.
2. Tableau de bord Stripe :
   - *Paramètres → Détails publics* : renseigner l'URL des CGV (`<PUBLIC_URL>/conditions`), sinon Checkout refuse la case de renonciation.
   - *Produits → Taux de taxe* : créer « TVA 21 % », **inclusive**, Belgique → `STRIPE_TAX_RATE_ID`.
   - *Paramètres → Moyens de paiement* : activer Bancontact (très utilisé en Belgique).
   - *Paramètres → Facturation* : votre numéro de TVA apparaît sur les factures.
3. Recevoir les webhooks en local (Stripe CLI) :

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   La commande affiche le `whsec_…` à mettre dans `STRIPE_WEBHOOK_SECRET`.
4. Payer avec la carte de test `4242 4242 4242 4242` (date future, n'importe quel CVC).

Parcours : bouton « Recevoir le rapport complet (PDF) » → Stripe Checkout → webhook signé (idempotent) →
exploration de 10 pages max → PDF balisé → e-mail (pièce jointe si < 8 Mo + lien 12 mois) → page `/commande/…`.
En cas d'échec : 2 nouvelles tentatives à 15 min, puis remboursement automatique, e-mail d'excuses, alerte admin.

**TVA** : taux fixe 21 %. L'autoliquidation (clients pros UE) et le guichet OSS (particuliers UE > 10 000 €/an)
demandent Stripe Tax — à valider avec votre comptable.

**Rapport de démonstration** (sans paiement, pour tester ou pour le portfolio) :

```bash
cd server && npm run pdf:demo -- www.exemple.be   # → server/data/demo-exemple.be.pdf
```

Vérifier l'accessibilité du PDF avec **PAC** (PDF Accessibility Checker, gratuit, Windows) : le balisage Chromium
est bon (arbre de structure, langue, signets, textes alternatifs) mais n'est pas certifié PDF/UA.

## Données personnelles (RGPD)

- Base : SQLite via Drizzle, sur le module `node:sqlite` intégré à Node (aucune dépendance native).
  Après une modification de `src/schema.ts` : `npm run db:generate` (la migration s'applique au démarrage).
- Consentement aux conseils : case non cochée, texte exact + version enregistrés, **double opt-in**
  (confirmation par lien, sinon annulé après 7 jours). Changer le texte ⇒ changer `CONSENTEMENT.version` dans `server.ts`.
- Liens des e-mails (confirmer, se désinscrire, supprimer) : le GET n'affiche qu'une page de confirmation,
  seul le POST agit — les antivirus de messagerie qui « cliquent » les liens ne peuvent rien déclencher.
- Conservation : rapports 12 mois, contacts 3 ans après le dernier échange ; purge au démarrage puis chaque jour.
- Le questionnaire EAA est calculé dans le navigateur : rien n'est envoyé ni stocké.
- **Avant la mise en ligne** : compléter les champs `[À COMPLÉTER]` de `web/src/app/confidentialite/confidentialite.ts`.

## Sécurité (SSRF)

Chromium n'accède jamais directement au réseau : chaque requête passe par un relais Node
qui valide l'URL, suit les redirections lui-même et vérifie l'IP **au moment de la connexion**
(anti DNS-rebinding). Filet de sécurité : Chromium est lancé avec un proxy inexistant.
