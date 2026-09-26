// Mocked API for the CI accessibility audit: deterministic, no backend, no external site scanned.

const RAPPORT = {
  url: 'https://www.boulangerie-dupont.be/',
  finalUrl: 'https://www.boulangerie-dupont.be/',
  scannedAt: '2026-09-27T10:00:00.000Z',
  score: 62,
  palier: 'Une base à consolider',
  synthese: "Votre site est sur la bonne voie, mais 2 problèmes empêchent certaines personnes de l'utiliser. Les corriger en priorité fera une vraie différence.",
  effortTotal: { minutes: 225, texte: "environ une demi-journée de travail pour l'essentiel" },
  mentions: [
    "Les tests automatiques ne détectent qu'une partie des problèmes d'accessibilité (environ un tiers). Un bon score ne signifie pas que le site est conforme.",
    "Ce rapport n'est pas un avis juridique.",
  ],
  totalProblemes: 7,
  pointsAVerifier: 2,
  problemes: [
    {
      id: 'label',
      titre: "Certains champs de formulaire n'ont pas d'étiquette",
      pourquoi: "Sans étiquette, une personne aveugle ne sait pas quoi écrire dans le champ, et le texte d'exemple grisé disparaît dès qu'on commence à taper.",
      touche: [{ id: 'aveugles', label: 'Personnes aveugles' }, { id: 'cognitif', label: 'Personnes avec des difficultés cognitives' }],
      priorite: 'Critique',
      effort: '1–2 h',
      quiCorrige: 'Votre webdesigner',
      etapes: ["Donnez à chaque champ une étiquette visible.", "Vérifiez que l'étiquette est bien reliée au champ."],
      cms: { wordpress: 'Contact Form 7, WPForms : affichez les libellés des champs.', wix: 'Paramètres du formulaire → affichez le titre de chaque champ.' },
      wcag: ['4.1.2'],
      occurrences: 3,
    },
    {
      id: 'image-alt',
      titre: "Certaines images n'ont pas de description",
      pourquoi: "Une personne aveugle qui utilise un lecteur d'écran ne saura pas ce que montre l'image.",
      touche: [{ id: 'aveugles', label: 'Personnes aveugles' }],
      priorite: 'Critique',
      effort: '15 min',
      quiCorrige: 'Vous-même, dans votre outil de gestion du site',
      etapes: ['Repérez les images listées.', "Décrivez en une phrase ce qu'elles montrent."],
      cms: { wordpress: "Médias → cliquez sur l'image → champ « Texte alternatif »." },
      wcag: ['1.1.1'],
      occurrences: 12,
    },
    {
      id: 'color-contrast',
      titre: 'Certains textes sont difficiles à lire (contraste trop faible)',
      pourquoi: 'Un texte gris clair sur fond blanc devient illisible pour une personne malvoyante.',
      touche: [{ id: 'malvoyants', label: 'Personnes malvoyantes' }, { id: 'daltoniens', label: 'Personnes daltoniennes' }],
      priorite: 'Importante',
      effort: '1–2 h',
      quiCorrige: 'Votre webdesigner',
      etapes: ['Repérez les couleurs concernées.', "Foncez le texte jusqu'à un rapport d'au moins 4,5 pour 1."],
      wcag: ['1.4.3'],
      occurrences: 5,
    },
    {
      id: 'target-size',
      titre: 'Certains boutons ou liens sont trop petits pour le doigt',
      pourquoi: 'Des cibles minuscules provoquent des erreurs pour les personnes qui ont des difficultés motrices.',
      touche: [{ id: 'moteur', label: 'Personnes à mobilité réduite' }],
      priorite: 'Importante',
      effort: '1–2 h',
      quiCorrige: 'Votre webdesigner',
      etapes: ['Repérez les petites icônes.', 'Agrandissez-les : au moins 24 × 24 pixels.'],
      wcag: ['2.5.8'],
      occurrences: 4,
      seulement: 'mobile',
    },
    {
      id: 'x-skip-link',
      titre: 'Il manque un lien « Aller au contenu »',
      pourquoi: 'Les personnes qui naviguent au clavier doivent passer par tout le menu, à chaque page.',
      touche: [{ id: 'clavier', label: 'Personnes qui naviguent au clavier' }],
      priorite: 'À améliorer',
      effort: '1–2 h',
      quiCorrige: 'Votre webdesigner',
      etapes: ['Ajoutez un lien « Aller au contenu » en haut de page.', 'Vérifiez-le avec la touche Tab.'],
      wcag: ['2.4.1'],
      occurrences: 1,
    },
  ],
};

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** One simulator per browser context: the scan is "running" twice, then done. */
export function simulateurApi() {
  let lectures = 0;
  return async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const m = req.method();

    if (m === 'POST' && pathname === '/api/scan') return json(route, 202, { id: 'demo' });
    if (m === 'GET' && pathname === '/api/scan/demo') {
      lectures++;
      const steps = ['Connexion au site…', 'Chargement de la page (ordinateur)…', 'Page chargée (ordinateur).'].slice(0, lectures + 1);
      return lectures <= 2
        ? json(route, 200, { id: 'demo', url: RAPPORT.url, status: 'running', steps, position: 0 })
        : json(route, 200, { id: 'demo', url: RAPPORT.url, status: 'done', steps: [], position: 0, report: RAPPORT });
    }
    if (m === 'GET' && pathname === '/api/consentement') {
      return json(route, 200, { version: '2026-09-27', texte: "J'accepte de recevoir vos conseils et offres par e-mail (1 à 2 par mois). Je peux me désinscrire en un clic." });
    }
    if (m === 'GET' && pathname === '/api/offre') return json(route, 200, { libelle: '39 € TVAC', disponible: true });
    if (m === 'POST' && pathname === '/api/scan/demo/email') {
      return json(route, 202, { message: "C'est envoyé ! Vérifiez votre boîte de réception : un lien vous permettra aussi de confirmer votre inscription à nos conseils." });
    }
    if (m === 'POST' && pathname === '/api/devis') {
      return json(route, 202, { message: 'Merci ! Nous avons bien reçu votre demande et vous répondons sous 2 jours ouvrables.' });
    }
    if (pathname.startsWith('/api/commandes/')) return json(route, 404, { error: 'pending', message: 'Nous attendons la confirmation de votre paiement.' });
    return json(route, 404, { error: 'not_found', message: 'Introuvable.' });
  };
}
