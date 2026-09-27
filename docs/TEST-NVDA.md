# Tester l'application avec NVDA

Les tests automatiques (axe, 57 écrans en CI) ne disent pas si l'application est **agréable et compréhensible**
à l'oreille. Ce guide fait vivre le parcours d'une personne aveugle, écran par écran, avec ce que NVDA doit
annoncer. Comptez **45 minutes** la première fois, 20 ensuite.

À refaire : avant la mise en ligne, puis après chaque modification visible d'un écran.

---

## 1. Préparer

1. **Installer NVDA** (gratuit, Windows) depuis [nvaccess.org](https://www.nvaccess.org/download/). La version
   installée est préférable à la version portable (meilleure prise en charge des navigateurs).
2. **Navigateur** : Firefox ou Chrome à jour. Faites tout le test dans le même navigateur, puis refaites les
   parcours 1 à 3 dans l'autre si vous avez le temps.
3. **Lancer l'application** : en local (`npm start` dans `server/` et `web/`, puis `http://localhost:4200`) ou
   sur le site en ligne.
4. **Afficher ce que NVDA dit** : menu NVDA (`NVDA+N`) → Outils → **Visionneuse de parole**. Tout ce qui est
   prononcé s'y écrit : pratique pour noter l'annonce exacte d'un problème.
5. **Si vous voyez l'écran** : essayez au moins un parcours en éteignant l'écran ou en fermant les yeux. On
   remarque alors ce qui manque, et pas seulement ce qui est faux.

> La touche **NVDA** est `Inser` (clavier de bureau) ou `Verr. Maj` (portable, si ce mode a été choisi à
> l'installation). `NVDA+N` signifie : maintenir `Inser` et appuyer sur `N`.

## 2. Les raccourcis utiles

NVDA a deux modes. En **mode navigation**, les lettres servent à se déplacer dans la page. En **mode
formulaire**, elles s'écrivent dans le champ. NVDA bascule tout seul en entrant dans un champ ; `NVDA+Espace`
force le changement.

| Touche | Action |
|---|---|
| `Ctrl` | Faire taire NVDA |
| `NVDA+Flèche bas` | Tout lire à partir d'ici |
| `Flèche bas` / `Flèche haut` | Ligne suivante / précédente |
| `Tab` / `Maj+Tab` | Élément interactif suivant / précédent (comme au clavier seul) |
| `H` / `Maj+H` | Titre suivant / précédent |
| `D` | Région suivante (bannière, contenu principal, pied de page…) |
| `F` | Champ de formulaire suivant |
| `B` | Bouton suivant |
| `K` | Lien suivant |
| `L` | Liste suivante |
| `T` | Tableau suivant (puis `Ctrl+Alt+flèches` pour aller de cellule en cellule) |
| `NVDA+F7` | Liste de tous les titres, liens, régions de la page |
| `Espace` / `Entrée` | Cocher, activer un bouton, ouvrir un bloc dépliable |

## 3. Comment noter

Pour chaque vérification : **OK**, **KO** ou **à discuter**. Pour un KO, copiez depuis la visionneuse de parole
ce que NVDA a réellement dit : c'est ce qui permet de corriger vite. Le tableau à remplir est à la fin.

Ne notez pas seulement les erreurs : une annonce **trop longue, répétée ou déroutante** est aussi un problème.

---

## Parcours 1 — Accueil

Ouvrez la page d'accueil et laissez NVDA lire.

| # | Faites | Attendu |
|---|---|---|
| 1.1 | Chargez la page | Le titre de l'onglet est lu : « Vérifiez l'accessibilité de votre site – … » |
| 1.2 | `Tab` une fois | « Aller au contenu, lien ». Le lien apparaît aussi à l'écran |
| 1.3 | `Entrée` sur ce lien | Le focus arrive au début du contenu (la lecture continue par le titre principal), sans recharger la page |
| 1.4 | `NVDA+F7`, onglet Titres | Niveau 1 « Votre site est-il accessible à tous ? » ; niveau 2 « Comment ça marche ? » avec 3 titres niveau 3 (les étapes) ; niveau 2 « Pourquoi en parler maintenant ? ». Rien d'autre |
| 1.5 | Écoutez un titre (`H`) | Il est lu normalement, comme une phrase, **pas épelé** lettre par lettre, bien qu'il soit affiché en capitales |
| 1.6 | `D` plusieurs fois | Au moins 4 régions : bannière (en-tête), navigation « Raccourcis », contenu principal, pied de page |
| 1.7 | `F` jusqu'au champ | « Adresse de votre site », « modifier » (ou « zone de texte »), suivi de « Par exemple : www.monentreprise.be » |
| 1.8 | Dans le champ vide, `Entrée` | « Indiquez l'adresse de votre site. » est annoncé ; le focus reste dans le champ, signalé « non valide » (ou « invalide ») |
| 1.9 | Tapez une lettre | Le message d'erreur disparaît ; le champ n'est plus annoncé comme non valide |
| 1.10 | Lisez après le formulaire (`Flèche bas`) | L'exemple de rapport n'est lu **que par sa légende** : « Exemple de rapport pour un site fictif : un score sur 100… ». Pas de « 65 », « Critique » ou « boulangerie-exemple » isolés |
| 1.11 | Lisez la suite (`Flèche bas`) | « European Accessibility Act » est prononcé à l'anglaise (le passage est marqué en anglais) |

### Bouton de thème (en-tête, sur n'importe quelle page)

Le site s'ouvre en thème sombre. Le bouton en haut à droite permet de passer en clair ; le choix est mémorisé
dans le navigateur.

| # | Faites | Attendu |
|---|---|---|
| 1.12 | `B` jusqu'au bouton | « Thème clair, bouton ». Le symbole ☀ n'est **pas** lu |
| 1.13 | `Espace` | La page passe en clair. Le focus reste sur le bouton, qui s'appelle maintenant « Thème sombre » (si NVDA ne le redit pas tout seul, `NVDA+Tab` relit l'élément actif) |
| 1.14 | `F5` pour recharger, puis `B` | Le thème clair est conservé ; le bouton dit toujours « Thème sombre » |
| 1.15 | `Espace` sur le bouton | Retour au thème sombre ; le bouton redevient « Thème clair » |

## Parcours 2 — Analyse en cours

Dans le champ, tapez l'adresse d'un vrai site (par exemple `fr.wikipedia.org`), puis `Entrée`.

| # | Faites | Attendu |
|---|---|---|
| 2.1 | Validez | « Analyse de fr.wikipedia.org en cours », titre niveau 1 : le focus y est placé automatiquement |
| 2.2 | Ne touchez à rien et écoutez | Les étapes sont annoncées **une à une** : « Connexion au site… », « Page chargée (ordinateur). », « … points vérifiés »… |
| 2.3 | Idem | **Aucune étape n'est répétée**, la liste n'est jamais relue en entier |
| 2.4 | S'il y a une file d'attente | « Vous êtes 2e dans la file d'attente. » (ou « Votre analyse va démarrer dans un instant. ») |
| 2.5 | Idem | La barre de progression animée n'est **pas** annoncée (elle est décorative) |

## Parcours 3 — Rapport gratuit

L'analyse se termine d'elle-même.

| # | Faites | Attendu |
|---|---|---|
| 3.1 | Attendez la fin | « Résultat pour fr.wikipedia.org », titre niveau 1 : le focus y est placé ; l'onglet devient « Résultat : …/100 – … » |
| 3.2 | `Flèche bas` quelques fois | La date, le lien vers la page analysée, puis **« Score : 65 sur 100 »** (en un seul morceau, « 65 » et « sur » bien séparés), puis le palier (« Une base à consolider »…) |
| 3.3 | Idem | Le cadran de la jauge n'est **pas** annoncé (image décorative) ; les icônes « ! », « ◐ », « ✓ » non plus |
| 3.4 | Continuez | La phrase de synthèse, puis une liste de chiffres clés, chacun suivi de sa valeur : « Temps de correction estimé », « Points prioritaires », « Problèmes relevés », « Points à vérifier vous-même » |
| 3.5 | `H` | « À savoir avant de lire ce rapport » : les mentions sont lues **avant** la liste des problèmes |
| 3.6 | `H` | « Les 5 points à corriger en priorité » (ou le nombre réel) ; `L` annonce une liste de 5 éléments |
| 3.7 | `H` sur chaque carte | Titre niveau 3 = le problème (ex. « Certains champs de formulaire n'ont pas d'étiquette ») |
| 3.8 | `Flèche bas` dans une carte | « Priorité : Critique » en toutes lettres ; « Pourquoi », « Personnes concernées », « Effort estimé », « Qui peut corriger » avec leur valeur |
| 3.9 | `H` | « Comment corriger » (niveau 4), puis une liste numérotée d'étapes |
| 3.10 | `Tab` jusqu'à « Instructions pour WordPress… » | Annoncé comme « réduit » ; `Entrée` l'ouvre (« développé ») et les instructions se lisent ensuite |
| 3.11 | Dans les étapes | Aucun mot de jargon dans les titres (« ARIA », « SVG », balises) ; les deux-points et guillemets ne coupent pas bizarrement la lecture |
| 3.12 | Fin du rapport | « Notre analyse a aussi relevé … autres problèmes … » est lu |

## Parcours 4 — Questionnaire EAA

Toujours sur le rapport, allez au titre « Votre entreprise est-elle concernée par l'EAA ? » (`H`).

| # | Faites | Attendu |
|---|---|---|
| 4.1 | `Tab` jusqu'au premier bouton radio | La question (« 1. Quelle est votre activité principale en ligne ? ») est annoncée avec l'option ; « bouton radio, non coché, 1 sur 6 » |
| 4.2 | `Flèche bas` | Passe d'une option à l'autre dans la même question |
| 4.3 | `Tab` jusqu'à « Voir la réponse », `Entrée` sans rien cocher | Le focus revient sur la première question sans réponse ; « Choisissez une réponse. » est lu avec la question |
| 4.4 | Répondez aux 3 questions, puis « Voir la réponse » | Le focus arrive sur le titre de la réponse (niveau 3, ex. « Vous pourriez être exempté ») ; le texte et « Ceci n'est pas un avis juridique… » suivent |
| 4.5 | Changez une réponse | L'ancienne réponse disparaît (pas de conclusion périmée affichée) |

## Parcours 5 — Recevoir le rapport par e-mail

Titre « Recevoir ce rapport par e-mail » (`H`).

| # | Faites | Attendu |
|---|---|---|
| 5.1 | `F` jusqu'au champ | « Votre adresse e-mail », champ de saisie |
| 5.2 | `Tab` | Case à cocher **non cochée**, suivie du texte complet du consentement et de « (facultatif) » |
| 5.3 | Champ vide, bouton « M'envoyer ce rapport par e-mail » | « Indiquez votre adresse e-mail. » est annoncé, le focus revient dans le champ |
| 5.4 | Adresse valide, envoi | « C'est envoyé ! … » est annoncé et reçoit le focus ; le formulaire disparaît sans laisser la personne « nulle part » |
| 5.5 | Liste des boutons (`NVDA+F7`, Boutons) | Les boutons ont des noms distincts : « Recevoir le rapport complet (PDF) » ≠ « M'envoyer ce rapport par e-mail » |

## Parcours 6 — Faire corriger mon site

Depuis le rapport, lien « Faire corriger mon site » (ou pied de page).

| # | Faites | Attendu |
|---|---|---|
| 6.1 | Chargement | Titre niveau 1 « Faire corriger mon site » ; si vous venez d'un rapport, une phrase indique qu'il sera joint |
| 6.2 | `F` sur chaque champ | Chaque champ a son nom ; les champs facultatifs disent « (facultatif) » ; « Adresse du site » est prérempli |
| 6.3 | Groupe « Ce que vous souhaitez » | Le nom du groupe et « Plusieurs choix possibles. » sont annoncés avec la première case |
| 6.4 | Listes déroulantes | « Outil utilisé pour le site », « Délai souhaité », « Budget envisagé (facultatif) », avec la valeur choisie |
| 6.5 | Le champ piège anti-robots | **N'est jamais annoncé** (ni avec `Tab`, ni avec `F`, ni en lisant la page) |
| 6.6 | « Envoyer ma demande » sans rien remplir | Le focus va sur le récapitulatif : « 4 points sont à corriger », puis la liste des erreurs, en liens |
| 6.7 | `Entrée` sur une erreur du récapitulatif | Le focus arrive **dans** le champ concerné, qui est annoncé avec son message d'erreur |
| 6.8 | Remplissez et envoyez | « Demande envoyée » (titre, avec le focus), puis « Merci ! … sous 2 jours ouvrables. » |

## Parcours 7 — Pages de texte

Confidentialité, Conditions générales, Design system (liens du pied de page).

| # | Faites | Attendu |
|---|---|---|
| 7.1 | `NVDA+F7` sur chaque page | Un seul titre niveau 1, des titres niveau 2 qui résument bien les sections |
| 7.2 | Design system : `T` | Le tableau des contrastes a une légende et des en-têtes de colonnes ; `Ctrl+Alt+Flèche droite` annonce l'en-tête de chaque colonne |
| 7.3 | Design system : `Tab` | La zone du tableau (qui défile sur petit écran) reçoit le focus avec un nom |
| 7.4 | Les codes d'exemple | Lus sans provoquer de confusion (ils sont affichés comme du texte) |
| 7.5 | Design system : bouton de thème, puis `T` | La légende du tableau suit le thème : « … (thème clair) » puis « … (thème sombre) », et les ratios changent |

## Parcours 8 — Suivi de commande (sans paiement)

Ouvrez `…/commande/test` (une commande qui n'existe pas).

| # | Faites | Attendu |
|---|---|---|
| 8.1 | Chargement | « Merci ! Nous confirmons votre paiement », titre niveau 1 avec le focus, puis « Cela prend quelques secondes. » |
| 8.2 | Attendez | Pas d'annonce d'erreur alarmante, pas de répétition toutes les 2 secondes |

## Parcours 9 (facultatif) — Le PDF payant

Générez le PDF de démonstration (`cd server && npm run pdf:demo -- www.exemple.be`) et ouvrez-le dans
**Adobe Acrobat Reader** avec NVDA.

| # | Faites | Attendu |
|---|---|---|
| 9.1 | `NVDA+F7` | Les titres du rapport (Résumé, Plan d'action, Comment corriger…) forment une table des matières logique |
| 9.2 | Lecture continue | L'ordre de lecture suit l'ordre visuel ; le pied de page (« page X sur Y ») ne coupe pas les phrases |
| 9.3 | `G` (graphique suivant) | Chaque capture est annoncée avec son texte « Capture 1 : … L'élément concerné est entouré en rouge. » |
| 9.4 | `T` sur le plan d'action | Tableau avec en-têtes de colonnes ; le nom du problème sert d'en-tête de ligne |

---

## Tableau de résultats

Copiez ce tableau dans un nouveau fichier (ou un ticket) à chaque session de test.

- Date :
- Testeur :
- NVDA (version) :
- Navigateur (version) :
- Adresse testée (local / en ligne) :

| # | Résultat (OK / KO / à discuter) | Ce que NVDA a dit (visionneuse de parole) | Remarque |
|---|---|---|---|
| 1.1 | | | |
| 1.2 | | | |
| … | | | |

## Que faire d'un KO

1. Notez le numéro, l'annonce exacte, NVDA + navigateur et leurs versions.
2. Refaites le point dans l'autre navigateur : si le problème n'existe que dans un seul, dites-le (c'est parfois
   un défaut du navigateur ou de NVDA, pas de l'application).
3. Ouvrez un ticket, ou transmettez ces éléments : chaque point de ce guide correspond à un endroit précis du code.

## Et ensuite

- **VoiceOver** (Mac, iPhone) : les mêmes parcours s'appliquent ; sur iPhone, testez au moins les parcours 1 à 3,
  l'essentiel des PME consultant leur rapport sur téléphone.
- **Zoom et clavier seul** : voir la checklist du README (zoom 200 % et 400 %, animations réduites, thème clair).
