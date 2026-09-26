import Stripe from 'stripe';

export const OFFRE = {
  prixCentimes: 3900,
  devise: 'eur',
  libelle: '39 € TVAC',
  nom: "Rapport d'accessibilité complet (PDF)",
  description: "Jusqu'à 10 pages analysées, plan d'action, captures d'écran, annexe technique et liste de vérification.",
} as const;

export function creerStripe(env: NodeJS.ProcessEnv = process.env): Stripe | null {
  return env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
}

export function creerSession(
  stripe: Stripe,
  { scanId, site, publicUrl, taxRateId }: { scanId: string; site: string; publicUrl: string; taxRateId?: string },
) {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    locale: 'fr',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: OFFRE.devise,
          unit_amount: OFFRE.prixCentimes,
          tax_behavior: 'inclusive',
          product_data: { name: OFFRE.nom, description: `${OFFRE.description} Site : ${site}.` },
        },
        // ponytail: fixed 21 % Belgian rate (STRIPE_TAX_RATE_ID, "inclusive", created in the Stripe dashboard).
        // EU B2B reverse charge and OSS (B2C in other EU countries above 10 000 €/year) need Stripe Tax (automatic_tax).
        ...(taxRateId ? { tax_rates: [taxRateId] } : {}),
      },
    ],
    invoice_creation: { enabled: true, invoice_data: { description: `${OFFRE.nom} – ${site}` } },
    tax_id_collection: { enabled: true },
    // Digital content delivered at once: the consumer must waive the 14-day withdrawal right explicitly.
    // Requires the terms URL to be set in Stripe (Settings → Public details).
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      terms_of_service_acceptance: {
        message: `J'accepte les [conditions générales](${publicUrl}/conditions) et je demande la livraison immédiate du rapport : je reconnais perdre mon droit de rétractation.`,
      },
      submit: { message: "Le rapport vous est envoyé par e-mail dès qu'il est prêt, en général en moins de 10 minutes." },
    },
    metadata: { scanId },
    payment_intent_data: { metadata: { scanId } },
    success_url: `${publicUrl}/commande/{CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicUrl}/analyse/${scanId}?paiement=annule`,
  });
}
