import { Component } from '@angular/core';

/**
 * Company identity, shared by the privacy and terms pages. Replace every value before going live:
 * both pages show a warning while any placeholder remains.
 */
export const RESPONSABLE = {
  nom: "[À COMPLÉTER : nom de l'entreprise]",
  adresse: '[À COMPLÉTER : adresse du siège]',
  bce: '[À COMPLÉTER : numéro BCE]',
  tva: '[À COMPLÉTER : numéro de TVA]',
  email: '[À COMPLÉTER : e-mail de contact]',
  hebergeur: "[À COMPLÉTER : hébergeur du site et pays d'hébergement]",
  tribunal: "[À COMPLÉTER : arrondissement judiciaire du siège]",
};
export const incomplet = (o: Record<string, string>) => Object.values(o).some((v) => v.startsWith('[À COMPLÉTER'));

@Component({
  selector: 'app-confidentialite',
  templateUrl: './confidentialite.html',
  styles: `
    .page { padding-top: var(--space-6); }
    section { max-width: var(--measure); margin-bottom: var(--space-5); }
    .avertissement {
      max-width: var(--measure); padding: var(--space-3) var(--space-4);
      border-left: 4px solid var(--c-critique); background: var(--c-critique-bg); color: var(--c-critique); font-weight: 700;
    }
    dt { font-weight: 700; margin-top: var(--space-3); }
    dd { margin: 0; }
    .maj { color: var(--c-text-muted); }
  `,
})
export class Confidentialite {
  protected readonly r = RESPONSABLE;
  protected readonly incomplet = incomplet(RESPONSABLE);
}
