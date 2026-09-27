# Déploiement sur un VPS Hostinger (Docker Compose + Caddy)

Tout tourne sur un seul serveur : **Caddy** (HTTPS automatique) devant **l'application** (API + site + Chromium),
avec un volume pour la base SQLite, les PDF livrés et les sauvegardes.

```
Internet ──443──▶ Caddy ──▶ app:3000 (API /api/*, site Angular, Chromium) ──▶ volume « donnees »
```

L'image est construite et publiée par la CI (GitHub Actions) sur `ghcr.io/fabricelago/a11y-check` à chaque push
sur `main` dont tous les tests sont verts. Le serveur ne compile rien : il télécharge l'image.

---

## 1. Commander le serveur et le domaine

- **VPS Hostinger (offre KVM)** : au moins **2 vCPU et 4 Go de mémoire** (Chromium est gourmand ;
  8 Go si vous attendez beaucoup de rapports payants). Vérifiez l'offre actuelle sur le site de Hostinger.
- **Centre de données dans l'Union européenne** (France, Pays-Bas ou Lituanie) : vos données et celles de vos
  clients restent dans l'UE.
- **Système** : le modèle « Ubuntu 24.04 avec Docker » (Docker et Compose déjà installés).
- **Accès** : ajoutez votre clé SSH à la création (plus sûr qu'un mot de passe).
- **Domaine** : chez Hostinger ou ailleurs.

## 2. Faire pointer le domaine vers le serveur (DNS)

Dans la zone DNS du domaine, avec l'adresse IP du VPS (visible dans le panneau Hostinger) :

| Type | Nom | Valeur |
|---|---|---|
| A | `@` | IP du VPS |
| A | `www` | IP du VPS |
| AAAA | `@` et `www` | IPv6 du VPS (si disponible) |

Attendez que `nslookup votre-domaine.be` renvoie bien l'IP du VPS avant l'étape 5 : Caddy a besoin du DNS
pour obtenir le certificat HTTPS. Sans enregistrement `www`, retirez le bloc `www.` du `Caddyfile`.

## 3. Préparer le serveur

```bash
ssh root@IP_DU_VPS
```

```bash
apt update && apt upgrade -y
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
mkdir -p /opt/a11y-check/docker
```

Activez aussi le pare-feu du panneau Hostinger avec les mêmes ports (22, 80, 443).

## 4. Copier les fichiers de déploiement

Seuls 4 fichiers sont nécessaires sur le serveur (le code est dans l'image). Depuis votre PC, dans le dossier du projet :

```bash
scp compose.yaml Caddyfile .env.example root@IP_DU_VPS:/opt/a11y-check/
scp docker/seccomp-chromium.json root@IP_DU_VPS:/opt/a11y-check/docker/
```

Puis sur le serveur, créez la configuration à partir du modèle et remplissez chaque `[À COMPLÉTER]` :

```bash
cd /opt/a11y-check && cp .env.example .env && chmod 600 .env && nano .env
```

## 5. Premier lancement

L'image `ghcr.io/fabricelago/a11y-check` est **publique** (comme le dépôt) : aucun `docker login` ni jeton
n'est nécessaire sur le serveur.

```bash
cd /opt/a11y-check
docker compose pull
docker compose up -d
docker compose ps          # app : « healthy », caddy : « Up »
docker compose logs -f caddy   # « certificate obtained successfully » pour votre domaine
```

Ouvrez `https://votre-domaine.be` : le site doit s'afficher en HTTPS. Lancez une analyse pour vérifier Chromium.

## 6. Paiement (Stripe) en production

Dans le tableau de bord Stripe, **d'abord en mode test** :

1. *Développeurs → Webhooks → Ajouter un endpoint* : `https://votre-domaine.be/api/stripe/webhook`,
   événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`.
   Copiez le secret de signature (`whsec_…`) dans `STRIPE_WEBHOOK_SECRET`.
2. *Paramètres → Détails publics* : URL des conditions générales `https://votre-domaine.be/conditions`
   (sans elle, Checkout refuse la case de renonciation au droit de rétractation).
3. *Produits → Taux de taxe* : « TVA 21 % », **inclusive**, Belgique → `STRIPE_TAX_RATE_ID`.
4. *Paramètres → Moyens de paiement* : activez Bancontact.

Rechargez la configuration : `docker compose up -d`. Faites un achat avec la carte `4242 4242 4242 4242`,
vérifiez la réception du PDF, puis recommencez les étapes 1 à 3 **en mode production** (clés `sk_live_…`).

## 7. E-mails (Brevo)

- Dans Brevo, *Expéditeurs et domaines* : authentifiez votre domaine. Brevo donne des enregistrements DNS
  (DKIM, code Brevo, et un enregistrement DMARC recommandé) à ajouter dans la zone DNS du domaine.
- *SMTP & API* : créez une clé SMTP → `SMTP_USER` / `SMTP_PASS` dans `.env`, puis `docker compose up -d`.
- Tant que `SMTP_HOST` est vide, aucun e-mail ne part : ils sont écrits dans le volume (`data/mails`).

## 8. Mises à jour

Poussez sur `main` : la CI teste, puis publie la nouvelle image (environ 5 minutes). Sur le serveur :

```bash
cd /opt/a11y-check && docker compose pull && docker compose up -d
```

Les analyses en cours ont 60 secondes pour se terminer ; les rapports payants interrompus reprennent seuls.

**Revenir à une version précédente** : chaque image est aussi étiquetée `sha-<commit>` (visible dans l'onglet
Packages de GitHub). Ajoutez par exemple `VERSION=sha-c102317` dans `.env`, puis `docker compose up -d`.
Retirez la ligne pour revenir à `latest`.

## 9. Sauvegardes

L'application copie la base **une fois par jour** (au démarrage, puis toutes les 24 heures) dans le volume, sous
`data/sauvegardes/a11y-AAAA-MM-JJ.db`, et garde 14 jours. La copie reste cohérente même si l'application écrit
au même moment (sauvegarde en ligne de SQLite).

**Copiez-les aussi hors du serveur** (une panne de disque emporterait tout). Depuis votre PC, par exemple
chaque semaine :

```bash
scp "root@IP_DU_VPS:/var/lib/docker/volumes/a11y-check_donnees/_data/sauvegardes/*" ./sauvegardes-a11y/
```

Les PDF livrés (`data/pdf`) ne sont pas dans ces sauvegardes : copiez aussi ce dossier si vous voulez que les
liens de téléchargement de vos clients survivent à une panne du serveur.

**Restaurer une sauvegarde** :

```bash
cd /opt/a11y-check
docker compose stop app
V=/var/lib/docker/volumes/a11y-check_donnees/_data
cp $V/a11y.db $V/a11y-avant-restauration.db
rm -f $V/a11y.db-wal $V/a11y.db-shm
cp $V/sauvegardes/a11y-AAAA-MM-JJ.db $V/a11y.db && chown 1000:1000 $V/a11y.db
docker compose start app
```

## 10. Surveiller

```bash
docker compose ps              # état et santé (sonde /api/sante toutes les 30 s)
docker compose logs -f app     # journaux de l'application
docker stats                   # mémoire et CPU (Chromium)
```

Les journaux sont limités à 5 × 10 Mo par conteneur. Le panneau Hostinger affiche aussi CPU, mémoire et disque.

## Sécurité en place

- HTTPS partout (HSTS), en-têtes de sécurité, politique de sécurité du contenu stricte (aucune ressource externe,
  aucun script en ligne), version du serveur masquée.
- L'application tourne sous un utilisateur non-root, sans nouveaux privilèges, et n'est pas exposée : seul Caddy
  lui parle.
- **Bac à sable de Chromium actif** (profil seccomp officiel de Playwright, `docker/seccomp-chromium.json`) :
  une page piégée qui exploiterait une faille de Chromium resterait enfermée.
- Protection SSRF : l'analyse ne peut atteindre ni le réseau interne de Docker, ni le serveur, ni les adresses privées.
- `.env` (clés Stripe, SMTP) lisible uniquement par root (`chmod 600`), jamais versionné.

## Avant d'ouvrir au public

- [ ] Identité du vendeur complétée (`web/src/app/confidentialite/confidentialite.ts`) : les bandeaux rouges
      « Page incomplète » disparaissent des pages Confidentialité et CGV.
- [ ] CGV et politique de confidentialité relues par un juriste ; TVA validée avec votre comptable.
- [ ] Stripe en production testé de bout en bout (achat réel remboursé).
- [ ] Domaine authentifié dans Brevo ; e-mail de rapport reçu dans une vraie boîte, hors indésirables.
- [ ] `BOT_INFO_URL` pointe vers une page qui explique le robot aux propriétaires de sites.
- [ ] Test NVDA / VoiceOver (checklist du README) et PDF de démonstration vérifié avec PAC.
- [ ] Première sauvegarde copiée hors du serveur, restauration essayée une fois.

## Tester en local (facultatif)

Avec Docker Desktop : `DOMAINE=localhost` dans `.env`, puis `docker compose up -d --build`. Caddy utilise alors un
certificat local. Si `https://localhost` est coupé net sous Windows alors que `http://localhost` répond, un
antivirus ou un filtre qui inspecte le HTTPS bloque le port 443 : le serveur n'est pas en cause.
