import { Component, computed, input } from '@angular/core';
import type { Probleme } from '../api';

const CMS_NOMS: Record<string, string> = { wordpress: 'WordPress', wix: 'Wix', shopify: 'Shopify' };
const NIVEAUX = {
  Critique: 'critique',
  Importante: 'importante',
  'À améliorer': 'ameliorer',
} as const;

/** "A, B ou C" */
export const listeFr = (items: string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ou ${items.at(-1)}`;

@Component({
  selector: 'app-carte-probleme',
  templateUrl: './carte-probleme.html',
  styleUrl: './carte-probleme.scss',
})
export class CarteProbleme {
  readonly probleme = input.required<Probleme>();

  protected readonly niveau = computed(() => NIVEAUX[this.probleme().priorite]);
  protected readonly titreId = computed(() => `probleme-${this.probleme().id}`);
  protected readonly personnes = computed(() =>
    this.probleme()
      .touche.map((t) => t.label)
      .join(', '),
  );
  protected readonly cms = computed(() =>
    Object.entries(this.probleme().cms ?? {}).map(([cle, texte]) => ({
      nom: CMS_NOMS[cle] ?? cle,
      texte,
    })),
  );
  protected readonly cmsResume = computed(
    () => `Instructions pour ${listeFr(this.cms().map((c) => c.nom))}`,
  );
}
