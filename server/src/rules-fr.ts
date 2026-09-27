import type { ImpactValue } from 'axe-core';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export type Audience = 'aveugles' | 'malvoyants' | 'daltoniens' | 'clavier' | 'malentendants' | 'cognitif' | 'moteur';
export type Effort = '15 min' | '1–2 h' | 'une demi-journée' | 'une journée ou plus';
export type Fixer = 'vous' | 'webdesigner' | 'developpeur';

export type RuleFr = {
  titre: string;
  pourquoi: string;
  touche: Audience[];
  effort: Effort;
  quiCorrige: Fixer;
  etapes: string[];
  cms?: Partial<Record<'wordpress' | 'wix' | 'shopify', string>>;
  /** Blocks people from acting (form, button…): becomes Critique even with few occurrences. */
  bloquant?: boolean;
  /** Only for our own checks; axe rules take WCAG criteria from their tags. */
  wcag?: string[];
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  aveugles: 'Personnes aveugles',
  malvoyants: 'Personnes malvoyantes',
  daltoniens: 'Personnes daltoniennes',
  clavier: 'Personnes qui naviguent au clavier',
  malentendants: 'Personnes sourdes ou malentendantes',
  cognitif: 'Personnes avec des difficultés cognitives',
  moteur: 'Personnes avec des difficultés motrices',
};

export const FIXER_LABELS: Record<Fixer, string> = {
  vous: 'Vous-même, dans votre outil de gestion du site',
  webdesigner: 'Votre webdesigner',
  developpeur: 'Un développeur',
};

const ARIA_POURQUOI =
  "Le code de la page contient des indications destinées aux lecteurs d'écran, mais elles sont mal utilisées : une personne aveugle reçoit une information fausse ou incomplète.";
const VERIF_LECTEUR = "Vérifiez le résultat avec un lecteur d'écran (NVDA, gratuit sur Windows, ou VoiceOver sur Mac) : chaque élément corrigé doit être annoncé clairement.";

/** Technical ARIA fixes: always a developer job, same shape. */
function aria(titre: string, etape: string, extra: Partial<RuleFr> = {}): RuleFr {
  return { titre, pourquoi: ARIA_POURQUOI, touche: ['aveugles'], effort: '1–2 h', quiCorrige: 'developpeur', etapes: [etape, VERIF_LECTEUR], ...extra };
}
const sansNom = (quoi: string) =>
  `Le lecteur d'écran annonce ${quoi} sans indiquer sa fonction : impossible de l'utiliser en confiance.`;

/**
 * French typography: non-breaking space before : ; ! ? and inside « », so a line never
 * starts with a colon or an orphan quote mark. Applied to every string of a rule.
 */
export const typo = (s: string) =>
  s.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

export function typographier<T>(valeur: T): T {
  if (typeof valeur === 'string') return typo(valeur) as T;
  if (Array.isArray(valeur)) return valeur.map(typographier) as T;
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, typographier(v)])) as T;
  }
  return valeur;
}

const VIDEO_CAPTIONS: Omit<RuleFr, 'wcag'> = {
  titre: "Des vidéos n'ont pas de sous-titres",
  pourquoi: 'Sans sous-titres, les personnes sourdes ou malentendantes perdent tout le message, tout comme celles qui regardent sans le son, dans le train par exemple.',
  touche: ['malentendants'],
  effort: 'une demi-journée',
  quiCorrige: 'vous',
  etapes: [
    'Créez un fichier de sous-titres (.vtt) : YouTube et de nombreux outils en génèrent un automatiquement, à relire attentivement.',
    'Ajoutez-le à la vidéo (balise <track kind="captions"> ou directement sur YouTube ou Vimeo).',
  ],
  cms: {
    wordpress: 'Bloc Vidéo → « Pistes de texte » → ajoutez votre fichier .vtt.',
    wix: 'Paramètres du lecteur vidéo → Sous-titres → Ajouter.',
    shopify: 'Hébergez la vidéo sur YouTube ou Vimeo avec les sous-titres activés, puis intégrez-la.',
  },
};

export const RULES: Record<string, RuleFr> = typographier({
  // ─── Images ───────────────────────────────────────────────
  'image-alt': {
    titre: "Certaines images n'ont pas de description",
    pourquoi: "Une personne aveugle qui utilise un lecteur d'écran ne saura pas ce que montre l'image.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'vous',
    etapes: [
      'Repérez les images listées dans le rapport.',
      "Décrivez en une phrase courte ce qu'elles montrent ou ce qu'elles apportent (« Façade du magasin, rue Neuve »).",
      "Si l'image est purement décorative, laissez la description vide : elle sera ignorée, c'est voulu.",
    ],
    cms: {
      wordpress: "Médias → cliquez sur l'image → champ « Texte alternatif ».",
      wix: "Cliquez sur l'image → Paramètres → champ « Texte alternatif ».",
      shopify: "Contenu → Fichiers (ou la fiche produit) → cliquez sur l'image → « Ajouter un texte alternatif ».",
    },
  },
  'input-image-alt': {
    titre: "Certains boutons en forme d'image n'ont pas de description",
    pourquoi: sansNom('un bouton dessiné en image (« Envoyer », « Rechercher »…)'),
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    bloquant: true,
    etapes: ['Repérez les boutons-images listés (<input type="image">).', "Ajoutez un attribut alt qui décrit l'action, par exemple alt=\"Rechercher\"."],
  },
  'area-alt': {
    titre: "Des zones cliquables d'une image n'ont pas de description",
    pourquoi: "Dans une image cliquable (plan, carte des magasins…), chaque zone doit être décrite, sinon la personne ne sait pas où mène chaque lien.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Ajoutez un attribut alt à chaque balise <area> (« Magasin de Liège », « Magasin de Namur »…).', 'Vérifiez que chaque zone mène bien à la bonne page.'],
  },
  'role-img-alt': {
    titre: "Certaines images créées par le code n'ont pas de description",
    pourquoi: "Un élément présenté comme une image aux lecteurs d'écran n'a pas de description : la personne aveugle entend « image » sans savoir ce qu'elle montre.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Ajoutez un aria-label descriptif aux éléments role="img" listés.', 'Si l\'image est purement décorative, retirez le role et ajoutez aria-hidden="true".'],
  },
  'svg-img-alt': {
    titre: "Des icônes ou illustrations n'ont pas de description",
    pourquoi: "Ces illustrations (souvent des icônes) sont annoncées comme des images, mais sans description : la personne aveugle ne sait pas ce qu'elles représentent.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Ajoutez une balise <title> dans le SVG, ou un aria-label.', 'Si le SVG est décoratif, ajoutez plutôt aria-hidden="true".'],
  },
  'object-alt': {
    titre: "Certains contenus intégrés n'ont pas de description",
    pourquoi: "Des contenus intégrés selon une technique ancienne n'ont pas d'équivalent texte : ils sont invisibles pour une personne aveugle.",
    touche: ['aveugles'],
    effort: '1–2 h',
    quiCorrige: 'developpeur',
    etapes: ['Ajoutez un texte alternatif aux éléments <object> listés (aria-label ou texte à l\'intérieur de la balise).', 'Si possible, remplacez-les par une technologie plus actuelle (image, vidéo HTML).'],
  },
  'server-side-image-map': {
    titre: "Certaines images cliquables ne fonctionnent qu'à la souris",
    pourquoi: 'Ces images cliquables d\'ancienne génération ne peuvent pas être utilisées au clavier ni décrites à une personne aveugle.',
    touche: ['clavier', 'aveugles'],
    effort: 'une demi-journée',
    quiCorrige: 'developpeur',
    bloquant: true,
    etapes: ['Remplacez l\'image cliquable « côté serveur » (attribut ismap) par des liens classiques ou une balise <map>.', 'Vérifiez à la touche Tab que chaque destination est atteignable.'],
  },

  // ─── Couleurs et lisibilité ───────────────────────────────
  'color-contrast': {
    titre: 'Certains textes sont difficiles à lire (contraste trop faible)',
    pourquoi: 'Un texte gris clair sur fond blanc devient illisible pour une personne malvoyante, et pour tout le monde en plein soleil sur un téléphone.',
    touche: ['malvoyants', 'daltoniens'],
    effort: '1–2 h',
    quiCorrige: 'webdesigner',
    etapes: [
      'Repérez les couleurs de texte concernées (souvent du gris clair, ou du texte posé sur une photo).',
      "Foncez le texte ou éclaircissez le fond jusqu'à un rapport d'au moins 4,5 pour 1 (3 pour 1 pour les grands titres). L'outil gratuit « Contrast Checker » de WebAIM vous donne la réponse en un clic.",
      'Modifiez ces couleurs dans les réglages du thème plutôt que texte par texte.',
    ],
    cms: {
      wordpress: 'Apparence → Personnaliser (ou Éditeur de site → Styles) → Couleurs.',
      wix: 'Paramètres du site → Thème du site → Couleurs.',
      shopify: 'Boutique en ligne → Thèmes → Personnaliser → Paramètres du thème → Couleurs.',
    },
  },
  'link-in-text-block': {
    titre: 'Des liens ne se distinguent que par leur couleur',
    pourquoi: "Une personne daltonienne ou malvoyante ne voit pas qu'un mot est un lien s'il n'est pas souligné.",
    touche: ['daltoniens', 'malvoyants'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Soulignez les liens placés au milieu des paragraphes : c\'est le plus simple et le plus clair.', 'À défaut, assurez un contraste d\'au moins 3 pour 1 avec le texte autour, et un soulignement au survol.'],
    cms: { wordpress: 'Apparence → Personnaliser → CSS additionnel : p a { text-decoration: underline; }' },
  },
  'avoid-inline-spacing': {
    titre: "L'espacement du texte ne peut pas être ajusté",
    pourquoi: "Certaines personnes dyslexiques ou malvoyantes augmentent l'espacement entre les lettres ou les lignes pour mieux lire. Ici, le site les en empêche.",
    touche: ['cognitif', 'malvoyants'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Retirez les « !important » des réglages d\'espacement écrits directement dans le HTML (letter-spacing, word-spacing, line-height).', 'Déplacez ces réglages dans la feuille de style du thème.'],
  },
  blink: {
    titre: 'Du texte clignote',
    pourquoi: 'Un texte qui clignote est difficile à lire et peut fortement distraire les personnes qui ont des troubles de l\'attention.',
    touche: ['cognitif', 'malvoyants'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Supprimez les balises <blink> et les effets de clignotement.', 'Pour attirer l\'attention, préférez une couleur ou une icône fixe.'],
  },
  marquee: {
    titre: 'Du texte défile tout seul',
    pourquoi: 'Un bandeau qui défile est difficile, voire impossible, à lire pour les personnes qui lisent lentement ou qui ont des troubles de l\'attention.',
    touche: ['cognitif', 'malvoyants'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Supprimez les balises <marquee> (bandeau défilant).', 'Affichez le message de façon fixe, ou ajoutez un bouton pause s\'il doit vraiment défiler.'],
  },

  // ─── Langue, titre, structure ─────────────────────────────
  'html-has-lang': {
    titre: "La langue de la page n'est pas indiquée",
    pourquoi: "Le lecteur d'écran ne sait pas qu'il doit lire en français : il risque de prononcer le texte avec un accent anglais, souvent incompréhensible.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Ajoutez lang="fr" (ou fr-BE) sur la balise <html> du modèle de page.', 'Pour un site multilingue, chaque version doit indiquer sa propre langue (nl, en…).'],
    cms: {
      wordpress: 'Réglages → Général → Langue du site : choisissez « Français ». Si le problème persiste, votre thème est en cause : demandez à votre webdesigner.',
      wix: 'Paramètres → Langue et région → vérifiez la langue du site.',
      shopify: 'Paramètres → Langues : vérifiez la langue par défaut de la boutique.',
    },
  },
  'html-lang-valid': {
    titre: "La langue indiquée pour la page n'est pas reconnue",
    pourquoi: "Un code de langue erroné (par exemple « francais » au lieu de « fr ») empêche le lecteur d'écran de choisir la bonne prononciation.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Corrigez l\'attribut lang de la balise <html> avec un code standard : fr, fr-BE, nl, en…', 'Vérifiez que votre outil de gestion du site ne remet pas l\'ancienne valeur : affichez le code source de la page (Ctrl+U) et cherchez « lang= ».'],
  },
  'html-xml-lang-mismatch': {
    titre: 'Deux langues différentes sont déclarées pour la page',
    pourquoi: "Les deux indications de langue de la page se contredisent : le lecteur d'écran peut choisir la mauvaise prononciation.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Donnez la même valeur aux attributs lang et xml:lang de la balise <html>.', 'Ou supprimez simplement xml:lang, devenu inutile.'],
  },
  'valid-lang': {
    titre: 'Certains passages de texte déclarent une langue non reconnue',
    pourquoi: "Un code de langue erroné sur un passage empêche le lecteur d'écran de le prononcer correctement.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Repérez les éléments listés qui portent un attribut lang.', 'Corrigez la valeur avec un code standard : fr, nl, en, de…'],
  },
  'document-title': {
    titre: "La page n'a pas de titre",
    pourquoi: "Le titre (affiché dans l'onglet du navigateur) est la première chose annoncée par un lecteur d'écran. Sans lui, impossible de savoir sur quelle page on se trouve.",
    touche: ['aveugles', 'cognitif'],
    effort: '15 min',
    quiCorrige: 'vous',
    etapes: ['Donnez à chaque page un titre court et unique, par exemple « Contact – Boulangerie Dupont ».', 'Placez d\'abord ce qui est propre à la page, puis le nom de votre entreprise.'],
    cms: {
      wordpress: 'Avec Yoast SEO ou Rank Math : champ « Titre SEO » en bas de chaque page.',
      wix: 'Menu Pages → ⋯ → Référencement (SEO) → Titre de la page.',
      shopify: 'En bas de chaque page ou produit : « Référencement » → Modifier → Titre de la page.',
    },
  },
  'p-as-heading': {
    titre: 'Des textes en gras servent de titres sans en être',
    pourquoi: "Les personnes aveugles passent de titre en titre pour parcourir une page. Un paragraphe simplement mis en gras n'apparaît pas dans cette liste.",
    touche: ['aveugles', 'cognitif'],
    effort: '15 min',
    quiCorrige: 'vous',
    etapes: ['Repérez les paragraphes en gras qui jouent le rôle de titre.', 'Transformez-les en vrais titres (Titre 2, Titre 3…) avec le sélecteur de style de votre éditeur.'],
    cms: {
      wordpress: 'Transformez le bloc Paragraphe en bloc « Titre » et choisissez H2 ou H3.',
      wix: 'Sélectionnez le texte → Thèmes de texte → « Titre 2 » ou « Titre 3 ».',
      shopify: 'Dans l\'éditeur de texte, menu « Paragraphe » → « Titre 2 ».',
    },
  },
  bypass: {
    titre: "Il manque un moyen d'aller directement au contenu",
    pourquoi: 'Une personne qui navigue au clavier doit traverser tout le menu, à chaque page, avant d\'atteindre le contenu.',
    touche: ['clavier', 'aveugles'],
    effort: '1–2 h',
    quiCorrige: 'webdesigner',
    etapes: [
      'Ajoutez tout en haut de la page un lien « Aller au contenu », qui apparaît quand on appuie sur la touche Tab.',
      'Encadrez le contenu principal d\'une balise <main> et structurez-le avec des titres (h1, h2…).',
    ],
    cms: { wordpress: 'La plupart des thèmes récents incluent ce lien : mettez votre thème à jour, ou choisissez un thème étiqueté « accessibility-ready ».' },
  },
  list: {
    titre: 'Certaines listes sont mal construites',
    pourquoi: "Le lecteur d'écran annonce « liste de 5 éléments » pour aider à se repérer. Une liste mal construite perd cette information.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Dans les listes signalées (<ul>, <ol>), ne placez directement que des éléments <li>.', 'Déplacez les autres éléments à l\'intérieur des <li>.'],
  },
  listitem: {
    titre: "Certains éléments de liste sont placés en dehors d'une liste",
    pourquoi: "Le lecteur d'écran ne peut pas annoncer la liste ni le nombre d'éléments : la personne perd ses repères.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Placez chaque <li> à l\'intérieur d\'une balise <ul> ou <ol>.', 'Si ces éléments ne forment pas une vraie liste, transformez-les en simples paragraphes.'],
  },
  'definition-list': {
    titre: 'Certaines listes de définitions sont mal construites',
    pourquoi: "Les termes et leurs définitions ne sont plus reliés pour le lecteur d'écran : l'information devient confuse.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Dans les balises <dl>, n\'utilisez que des paires <dt> (terme) et <dd> (définition).', 'Déplacez les autres éléments en dehors de la liste.'],
  },
  dlitem: {
    titre: "Certains termes ou définitions sont placés en dehors de leur liste",
    pourquoi: "Le lecteur d'écran ne peut pas relier le terme à sa définition.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Placez les éléments <dt> et <dd> à l\'intérieur d\'une balise <dl>.', 'Ou remplacez-les par des balises plus adaptées (paragraphes, titres).'],
  },
  'td-has-header': {
    titre: "Dans certains tableaux, les cellules ne sont reliées à aucun en-tête",
    pourquoi: "Dans un tableau de prix ou d'horaires, le lecteur d'écran annonce « 12 € » sans dire à quelle ligne ni à quelle colonne cela correspond.",
    touche: ['aveugles'],
    effort: '1–2 h',
    quiCorrige: 'webdesigner',
    etapes: ['Transformez la première ligne (et si besoin la première colonne) en cellules d\'en-tête <th>.', 'Ajoutez scope="col" ou scope="row" sur ces en-têtes.'],
    cms: { wordpress: 'Bloc Tableau → réglages du bloc → activez « Section d\'en-tête ».' },
  },
  'td-headers-attr': {
    titre: "Certains tableaux renvoient vers des en-têtes qui n'existent pas",
    pourquoi: "Les cellules sont reliées à des en-têtes introuvables : le lecteur d'écran annonce les données sans leur contexte.",
    touche: ['aveugles'],
    effort: '1–2 h',
    quiCorrige: 'developpeur',
    etapes: ['Vérifiez que l\'attribut headers de chaque cellule cite l\'id d\'un en-tête existant du même tableau.', 'Pour un tableau simple, supprimez les attributs headers et utilisez des <th scope="col"> : c\'est plus fiable.'],
  },
  'th-has-data-cells': {
    titre: 'Certains en-têtes de tableau ne correspondent à aucune donnée',
    pourquoi: "Un en-tête vide de contenu trompe la personne qui parcourt le tableau avec un lecteur d'écran.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Repérez les en-têtes <th> listés qui ne décrivent aucune cellule.', 'Supprimez-les, ou transformez-les en cellules normales <td>.'],
  },
  'table-fake-caption': {
    titre: "Certains titres de tableau sont de simples lignes de cellules",
    pourquoi: "Le lecteur d'écran ne reconnaît pas ce titre et le lit comme une donnée du tableau.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Remplacez la ligne fusionnée qui sert de titre par une balise <caption> placée juste après <table>.', 'Si le tableau n\'a pas besoin de titre, supprimez simplement cette ligne.'],
  },
  'summary-name': {
    titre: "Certains blocs dépliables n'ont pas de titre",
    pourquoi: sansNom('un bloc à déplier (FAQ, « En savoir plus »)'),
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Ajoutez un texte dans chaque balise <summary> (par exemple la question de la FAQ).', 'Vérifiez au clavier : la touche Tab doit atteindre chaque bloc, et Entrée doit l\'ouvrir et le refermer.'],
  },

  // ─── Liens et boutons ─────────────────────────────────────
  'link-name': {
    titre: "Certains liens n'ont pas de nom",
    pourquoi: "Un lien réduit à une icône (réseaux sociaux, panier…) est annoncé « lien » sans plus d'information : la personne ne sait pas où il mène.",
    touche: ['aveugles', 'clavier'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    bloquant: true,
    etapes: [
      'Repérez les liens qui ne contiennent qu\'une icône ou une image.',
      'Donnez-leur un texte : texte alternatif de l\'image (« Notre page Facebook ») ou texte masqué visuellement.',
    ],
    cms: {
      wordpress: 'Pour une image-lien : remplissez son texte alternatif. Bloc « Icônes de réseaux sociaux » : renseignez le libellé de chaque icône.',
      wix: 'Barre de réseaux sociaux → Paramètres → texte alternatif de chaque icône.',
    },
  },
  'button-name': {
    titre: "Certains boutons n'ont pas de nom",
    pourquoi: sansNom('un bouton sans texte (loupe de recherche, croix de fermeture, menu)'),
    touche: ['aveugles', 'clavier'],
    effort: '1–2 h',
    quiCorrige: 'developpeur',
    bloquant: true,
    etapes: ['Repérez les boutons qui ne contiennent qu\'une icône.', 'Ajoutez un nom accessible : texte visible, texte masqué visuellement ou attribut aria-label (« Rechercher », « Fermer », « Ouvrir le menu »).'],
  },
  'input-button-name': {
    titre: "Certains boutons de formulaire n'ont pas de texte",
    pourquoi: sansNom('un bouton de formulaire vide'),
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    bloquant: true,
    etapes: ['Repérez les boutons listés (<input type="submit">, "button" ou "reset").', 'Ajoutez un attribut value qui décrit l\'action : « Envoyer », « S\'inscrire »…'],
  },
  'label-content-name-mismatch': {
    titre: 'Le nom technique de certains boutons ne correspond pas à leur texte visible',
    pourquoi: "Les personnes qui pilotent leur ordinateur à la voix disent « cliquer sur Envoyer ». Si le nom technique du bouton est différent, la commande ne fonctionne pas.",
    touche: ['moteur'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Faites commencer l\'aria-label des éléments listés par leur texte visible (texte « Envoyer » → aria-label="Envoyer le formulaire").', 'Ou supprimez l\'aria-label si le texte visible suffit.'],
  },
  'nested-interactive': {
    titre: 'Des éléments cliquables sont imbriqués les uns dans les autres',
    pourquoi: "Un bouton placé dans un lien (ou l'inverse) est mal annoncé par les lecteurs d'écran et peut être impossible à atteindre au clavier.",
    touche: ['aveugles', 'clavier'],
    effort: '1–2 h',
    quiCorrige: 'developpeur',
    etapes: ['Séparez les éléments imbriqués : un lien et un bouton côte à côte plutôt que l\'un dans l\'autre.', 'Vérifiez à la touche Tab que chacun reçoit le focus.'],
  },
  'target-size': {
    titre: 'Certains boutons ou liens sont trop petits pour le doigt',
    pourquoi: 'Des cibles minuscules ou trop serrées provoquent des erreurs pour les personnes qui tremblent ou ont des difficultés motrices, et pour tout le monde sur téléphone.',
    touche: ['moteur', 'malvoyants'],
    effort: '1–2 h',
    quiCorrige: 'webdesigner',
    etapes: ['Repérez les petites icônes et les liens serrés (souvent dans le pied de page ou les réseaux sociaux).', 'Agrandissez-les ou espacez-les : au moins 24 × 24 pixels, idéalement 44 × 44.'],
  },

  // ─── Formulaires ──────────────────────────────────────────
  label: {
    titre: "Certains champs de formulaire n'ont pas d'étiquette",
    pourquoi: "Sans étiquette, une personne aveugle ne sait pas quoi écrire dans le champ, et le texte d'exemple grisé disparaît dès qu'on commence à taper.",
    touche: ['aveugles', 'cognitif'],
    effort: '1–2 h',
    quiCorrige: 'webdesigner',
    bloquant: true,
    etapes: [
      'Donnez à chaque champ une étiquette visible (« Adresse e-mail ») plutôt qu\'un simple texte d\'exemple dans le champ.',
      'Vérifiez que l\'étiquette est bien reliée : en cliquant dessus, le curseur doit se placer dans le champ.',
    ],
    cms: {
      wordpress: 'Contact Form 7, WPForms, Gravity Forms : affichez les libellés des champs au lieu des textes d\'exemple (placeholders).',
      wix: 'Paramètres du formulaire → affichez le titre de chaque champ.',
      shopify: 'Formulaire de contact : si les libellés sont masqués par le thème, demandez à votre webdesigner de les afficher.',
    },
  },
  'select-name': {
    titre: "Certaines listes déroulantes n'ont pas d'étiquette",
    pourquoi: 'La personne entend « liste déroulante » sans savoir ce qu\'on lui demande de choisir (pays, taille, quantité…).',
    touche: ['aveugles', 'cognitif'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    bloquant: true,
    etapes: ['Ajoutez une étiquette visible (<label>) reliée à chaque liste déroulante.', 'Vérifiez qu\'un clic sur l\'étiquette active bien la liste.'],
    cms: { shopify: 'Sélecteurs de variantes (taille, couleur) : dans l\'éditeur de thème, vérifiez que les libellés sont affichés.' },
  },
  'form-field-multiple-labels': {
    titre: 'Certains champs de formulaire ont plusieurs étiquettes',
    pourquoi: "Avec deux étiquettes, les lecteurs d'écran n'en annoncent parfois qu'une, ou les mélangent : la consigne devient confuse.",
    touche: ['aveugles', 'cognitif'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Gardez une seule étiquette (<label>) par champ.', 'Placez les consignes complémentaires dans un texte d\'aide relié au champ (aria-describedby).'],
  },
  'autocomplete-valid': {
    titre: 'Le remplissage automatique de certains champs est mal indiqué',
    pourquoi: 'Le navigateur peut pré-remplir nom, adresse ou e-mail, ce qui aide beaucoup les personnes avec des difficultés motrices ou cognitives. Ici, l\'indication est incorrecte.',
    touche: ['cognitif', 'moteur'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Corrigez l\'attribut autocomplete des champs listés avec une valeur standard : name, email, tel, street-address, postal-code…', 'Testez le formulaire : le navigateur doit proposer les informations enregistrées.'],
  },

  // ─── Clavier, navigation, mouvement ───────────────────────
  'scrollable-region-focusable': {
    titre: 'Certaines zones qui défilent sont inaccessibles au clavier',
    pourquoi: 'Un bloc avec sa propre barre de défilement (tableau large, conditions générales…) ne peut pas être parcouru sans souris.',
    touche: ['clavier'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    bloquant: true,
    etapes: ['Ajoutez tabindex="0" à la zone qui défile, avec un aria-label qui décrit son contenu.', 'Testez : avec Tab puis les flèches, le contenu doit défiler.'],
  },
  'frame-focusable-content': {
    titre: 'Certains contenus intégrés sont inaccessibles au clavier',
    pourquoi: 'Cette intégration contient des liens ou des boutons, mais elle a été rendue inatteignable au clavier : impossible de les utiliser sans souris.',
    touche: ['clavier'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    bloquant: true,
    etapes: ['Retirez tabindex="-1" des iframes qui contiennent des éléments interactifs.', 'Vérifiez à la touche Tab que l\'on peut entrer dans l\'intégration et en sortir.'],
  },
  'frame-title': {
    titre: "Certains contenus intégrés (vidéo, carte, formulaire) n'ont pas de titre",
    pourquoi: "Les contenus venant d'un autre site sont annoncés « cadre » sans plus d'information : la personne ne sait pas s'il s'agit d'une carte, d'une vidéo ou d'un formulaire.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Repérez les intégrations listées (YouTube, Google Maps, formulaire externe…).', 'Ajoutez un attribut title descriptif sur la balise <iframe>, par exemple title="Plan d\'accès".'],
  },
  'frame-title-unique': {
    titre: 'Plusieurs contenus intégrés portent le même titre',
    pourquoi: "Deux cadres annoncés de la même façon sont impossibles à distinguer avec un lecteur d'écran.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    etapes: ['Repérez les iframes listées.', 'Donnez à chacune un title différent qui décrit son contenu.'],
  },
  'meta-viewport': {
    titre: 'Le zoom est bloqué sur mobile',
    pourquoi: 'Une personne malvoyante agrandit le texte avec deux doigts sur son téléphone. Ici, le site l\'en empêche.',
    touche: ['malvoyants'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    bloquant: true,
    etapes: ['Dans l\'en-tête du modèle de page, retirez user-scalable=no et maximum-scale=1 de la balise <meta name="viewport">.', 'Gardez simplement : width=device-width, initial-scale=1.'],
  },
  'css-orientation-lock': {
    titre: "Le site impose l'affichage vertical ou horizontal",
    pourquoi: "Une personne dont la tablette est fixée à un fauteuil roulant ne peut pas la tourner : si le site impose un sens, elle ne peut pas l'utiliser.",
    touche: ['moteur'],
    effort: '1–2 h',
    quiCorrige: 'developpeur',
    etapes: ['Supprimez les règles CSS qui forcent l\'orientation (rotation dans une media query « orientation »).', 'Vérifiez que le site s\'affiche correctement dans les deux sens.'],
  },
  'meta-refresh': {
    titre: 'La page se recharge ou change toute seule',
    pourquoi: "Un rechargement automatique fait perdre le fil à une personne qui lit lentement ou qui utilise un lecteur d'écran.",
    touche: ['aveugles', 'cognitif'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    etapes: ['Supprimez la balise <meta http-equiv="refresh"> de l\'en-tête.', 'Pour une redirection, utilisez une redirection côté serveur (301).'],
  },

  // ─── Son et vidéo ─────────────────────────────────────────
  'no-autoplay-audio': {
    titre: 'Du son démarre automatiquement',
    pourquoi: "Un son qui démarre tout seul couvre la voix du lecteur d'écran : la personne aveugle n'entend plus rien de la page.",
    touche: ['aveugles', 'cognitif'],
    effort: '15 min',
    quiCorrige: 'webdesigner',
    bloquant: true,
    etapes: ['Désactivez la lecture automatique des vidéos et musiques avec son.', 'Si elle est indispensable, coupez le son par défaut ou limitez-la à 3 secondes.'],
  },
  'video-caption': VIDEO_CAPTIONS,
  'audio-caption': {
    titre: "Des fichiers audio n'ont pas de transcription",
    pourquoi: "Sans transcription écrite, une personne sourde ou malentendante n'a aucun accès au contenu audio.",
    touche: ['malentendants'],
    effort: 'une demi-journée',
    quiCorrige: 'vous',
    etapes: ['Rédigez une transcription du contenu audio (podcast, message…). Un outil de transcription automatique fait gagner du temps, à relire.', 'Publiez-la sous le lecteur audio ou via un lien juste à côté.'],
  },

  // ─── Identifiants et ARIA (développeur) ───────────────────
  'duplicate-id-aria': {
    titre: 'Plusieurs éléments partagent le même identifiant',
    pourquoi: "Les étiquettes sont reliées aux champs par un identifiant. S'il est utilisé deux fois, le lecteur d'écran peut annoncer la mauvaise étiquette.",
    touche: ['aveugles'],
    effort: '1–2 h',
    quiCorrige: 'developpeur',
    etapes: ['Repérez les identifiants (attribut id) en double listés dans l\'annexe technique.', 'Rendez chaque id unique et mettez à jour les attributs qui y renvoient (for, aria-labelledby, aria-describedby).'],
  },
  'aria-hidden-body': {
    titre: "Toute la page est masquée aux lecteurs d'écran",
    pourquoi: "La page porte un réglage qui la rend invisible aux lecteurs d'écran : une personne aveugle n'entend absolument rien.",
    touche: ['aveugles'],
    effort: '15 min',
    quiCorrige: 'developpeur',
    bloquant: true,
    etapes: ['Retirez aria-hidden="true" de la balise <body>.', 'La cause est souvent une fenêtre surgissante ou un bandeau cookies mal refermé : vérifiez le script concerné.'],
  },
  'aria-hidden-focus': {
    titre: 'Des éléments invisibles restent atteignables au clavier',
    pourquoi: "La personne qui navigue au clavier tombe sur des liens « fantômes » : ils reçoivent le focus, mais le lecteur d'écran n'annonce rien.",
    touche: ['clavier', 'aveugles'],
    effort: '1–2 h',
    quiCorrige: 'developpeur',
    etapes: ['Dans les zones masquées (aria-hidden="true"), rendez aussi les liens et boutons inatteignables (attribut inert ou tabindex="-1").', 'Ou retirez aria-hidden si ce contenu doit être utilisable.'],
  },
  'aria-allowed-attr': aria("Des indications pour lecteurs d'écran sont placées au mauvais endroit", 'Retirez des éléments listés les attributs aria-* qui ne correspondent pas à leur rôle.'),
  'aria-prohibited-attr': aria("Des indications pour lecteurs d'écran sont utilisées là où elles sont interdites", 'Retirez les attributs aria-* interdits sur les éléments listés (souvent aria-label sur un simple <div> ou <span>) ou donnez à ces éléments un rôle adapté.'),
  'aria-conditional-attr': aria("Des indications pour lecteurs d'écran sont utilisées dans un contexte incorrect", 'Corrigez ou retirez les attributs aria-* signalés, qui ne sont autorisés que dans certaines conditions (par exemple aria-checked sur une case à cocher native).'),
  'aria-required-attr': aria("Des indications obligatoires pour lecteurs d'écran manquent", 'Ajoutez aux éléments listés les attributs requis par leur rôle (par exemple aria-checked pour role="checkbox").'),
  'aria-valid-attr': aria("Des indications pour lecteurs d'écran contiennent des fautes de frappe", 'Corrigez l\'orthographe des attributs aria-* listés, ou supprimez-les.'),
  'aria-valid-attr-value': aria("Des indications pour lecteurs d'écran ont une valeur incorrecte", 'Corrigez les valeurs des attributs aria-* listés (valeurs autorisées, identifiants qui existent réellement).'),
  'aria-roles': aria("Certains éléments sont présentés aux lecteurs d'écran avec un type qui n'existe pas", 'Remplacez les valeurs de l\'attribut role listées par un rôle valide, ou supprimez l\'attribut.'),
  'aria-deprecated-role': aria("Certains éléments sont présentés aux lecteurs d'écran avec un type obsolète", 'Remplacez les rôles obsolètes listés par leur équivalent actuel ou par la balise HTML adaptée.'),
  'aria-roledescription': aria("Certaines descriptions d'éléments destinées aux lecteurs d'écran sont mal utilisées", 'Retirez aria-roledescription des éléments qui n\'ont pas de rôle explicite, ou ajoutez-leur un rôle valide.'),
  'aria-braille-equivalent': aria('Des indications pour le braille sont incomplètes', 'Pour les éléments listés, ajoutez l\'équivalent non-braille (aria-label ou aria-roledescription) à côté de aria-braillelabel ou aria-brailleroledescription.'),
  'aria-required-children': aria('Certains composants interactifs (menus, onglets…) sont incomplets', 'Ajoutez les éléments enfants attendus par le rôle (par exemple des role="menuitem" dans un role="menu"), ou utilisez les balises HTML natives.'),
  'aria-required-parent': aria('Certains composants interactifs (menus, onglets…) sont placés au mauvais endroit', 'Placez les éléments listés dans le parent attendu par leur rôle (par exemple role="tab" dans role="tablist").'),
  'aria-command-name': aria("Des commandes n'ont pas de nom", 'Donnez un nom (texte, aria-label ou aria-labelledby) aux éléments role="button", "link" ou "menuitem" listés.', { pourquoi: sansNom('une commande'), touche: ['aveugles', 'clavier'], bloquant: true }),
  'aria-input-field-name': aria("Des champs de saisie n'ont pas de nom", 'Donnez un nom (aria-label ou aria-labelledby) aux champs listés (role="combobox", "searchbox", "textbox"…).', { pourquoi: sansNom('un champ'), touche: ['aveugles', 'cognitif'], bloquant: true }),
  'aria-toggle-field-name': aria("Des interrupteurs ou cases à cocher n'ont pas de nom", 'Donnez un nom (aria-label ou aria-labelledby) aux éléments listés (role="checkbox", "switch", "radio"…).', { pourquoi: sansNom('une case à cocher ou un interrupteur'), bloquant: true }),
  'aria-tab-name': aria("Des onglets n'ont pas de nom", 'Ajoutez un texte ou un aria-label à chaque élément role="tab".', { pourquoi: sansNom('un onglet') }),
  'aria-tooltip-name': aria("Des infobulles n'ont pas de texte", 'Ajoutez un texte à chaque élément role="tooltip".', { pourquoi: "Le lecteur d'écran annonce une infobulle vide : l'information qu'elle devait donner est perdue." }),
  'aria-meter-name': aria("Des jauges n'ont pas de nom", 'Ajoutez un aria-label (« Niveau de stock ») à chaque élément role="meter".', { pourquoi: "Le lecteur d'écran annonce une valeur sans dire à quoi elle correspond." }),
  'aria-progressbar-name': aria("Des barres de progression n'ont pas de nom", 'Ajoutez un aria-label (« Envoi du fichier ») à chaque élément role="progressbar".', { pourquoi: "Le lecteur d'écran annonce un pourcentage sans dire ce qui progresse." }),
});

/** Our own checks, not axe rules. */
export const EXTRA_RULES: Record<string, RuleFr> = typographier({
  'x-skip-link': {
    titre: 'Il manque un lien « Aller au contenu »',
    pourquoi: 'Les personnes qui naviguent au clavier doivent passer par tous les liens du menu avant d\'atteindre le contenu, à chaque page.',
    touche: ['clavier'],
    effort: '1–2 h',
    quiCorrige: 'webdesigner',
    etapes: [
      'Ajoutez tout en haut de la page un lien « Aller au contenu » qui mène au début du contenu principal.',
      'Vérifiez-le : ouvrez votre site, appuyez sur la touche Tab, le lien doit apparaître en premier.',
    ],
    wcag: ['2.4.1'],
  },
  'x-video-captions': { ...VIDEO_CAPTIONS, wcag: ['1.2.2'] },
  'x-video-embed': {
    titre: 'Des vidéos intégrées (YouTube, Vimeo…) sont à vérifier',
    pourquoi: 'Nous ne pouvons pas vérifier automatiquement si ces vidéos ont des sous-titres. Sans eux, les personnes sourdes ou malentendantes perdent le message.',
    touche: ['malentendants'],
    effort: '15 min',
    quiCorrige: 'vous',
    etapes: [
      'Ouvrez chaque vidéo sur YouTube ou Vimeo et cliquez sur le bouton « CC ».',
      'Si aucun sous-titre n\'apparaît, ajoutez-en depuis votre espace de gestion de la plateforme (les sous-titres automatiques sont à relire).',
    ],
    wcag: ['1.2.2'],
  },
});

/** Never shows axe's English text: unknown rules get a clean French fallback. */
export function ruleFr(id: string, impact: ImpactValue | null | undefined): RuleFr {
  return RULES[id] ?? EXTRA_RULES[id] ?? typographier({
    titre: 'Un point technique est à corriger',
    pourquoi: "Ce défaut peut gêner les personnes qui utilisent un lecteur d'écran ou qui naviguent au clavier.",
    touche: ['aveugles', 'clavier'],
    effort: impact === 'critical' || impact === 'serious' ? 'une journée ou plus' : '1–2 h',
    quiCorrige: 'developpeur',
    etapes: ['Transmettez ce point à votre développeur avec la liste des éléments concernés.', 'Demandez-lui de vérifier la correction au clavier et avec un lecteur d\'écran.'],
  });
}
