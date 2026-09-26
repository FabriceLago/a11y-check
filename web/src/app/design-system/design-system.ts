import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { Probleme } from '../api';
import { CarteProbleme } from '../ui/carte-probleme';
import { ScoreJauge } from '../ui/score-jauge';
import { niveau, ratio } from './contraste';

type Paire = { usage: string; texte: string; fond: string; nonTexte?: boolean };

const PAIRES: Paire[] = [
  { usage: 'Texte principal', texte: '--c-text', fond: '--c-bg' },
  { usage: 'Texte secondaire', texte: '--c-text-muted', fond: '--c-bg' },
  { usage: 'Texte secondaire sur fond de carte', texte: '--c-text-muted', fond: '--c-surface' },
  { usage: 'Liens', texte: '--c-link', fond: '--c-bg' },
  { usage: 'Texte de bouton principal', texte: '--c-on-primary', fond: '--c-primary' },
  { usage: 'Texte d’accent', texte: '--c-accent', fond: '--c-bg' },
  { usage: 'Priorité « Critique » et erreurs', texte: '--c-critique', fond: '--c-critique-bg' },
  { usage: 'Priorité « Importante »', texte: '--c-importante', fond: '--c-importante-bg' },
  { usage: 'Priorité « À améliorer »', texte: '--c-ameliorer', fond: '--c-ameliorer-bg' },
  { usage: 'Anneau de focus', texte: '--c-focus', fond: '--c-bg', nonTexte: true },
  { usage: 'Bordure des champs', texte: '--c-border-strong', fond: '--c-bg', nonTexte: true },
  { usage: 'Jauge : obstacles importants', texte: '--c-score-bas', fond: '--c-bg', nonTexte: true },
  { usage: 'Jauge : base à consolider', texte: '--c-score-moyen', fond: '--c-bg', nonTexte: true },
  { usage: 'Jauge : bonne base', texte: '--c-score-haut', fond: '--c-bg', nonTexte: true },
];

export const EXEMPLE_PROBLEME: Probleme = {
  id: 'image-alt',
  titre: "Certaines images n'ont pas de description",
  pourquoi: "Une personne aveugle qui utilise un lecteur d'écran ne saura pas ce que montre l'image.",
  touche: [{ id: 'aveugles', label: 'Personnes aveugles' }],
  priorite: 'Critique',
  effort: '15 min',
  quiCorrige: 'Vous-même, dans votre outil de gestion du site',
  etapes: ['Repérez les images listées dans le rapport.', 'Décrivez en une phrase ce qu’elles montrent.'],
  cms: { wordpress: 'Médias → cliquez sur l’image → champ « Texte alternatif ».' },
  wcag: ['1.1.1'],
  occurrences: 4,
};

export const CODE = {
  bouton: `<button type="submit" class="button">Analyser mon site</button>
<a class="button button--secondary" routerLink="/">Retour</a>
<!-- Envoi en cours : on garde le bouton focusable -->
<button class="button" aria-disabled="true">Envoi en cours…</button>`,
  champ: `<label class="libelle" for="email">Adresse e-mail</label>
<p class="message-erreur" id="email-erreur">
  <span class="message-erreur__icone" aria-hidden="true">!</span>
  Cette adresse e-mail ne semble pas valide.
</p>
<input class="champ" id="email" type="email" autocomplete="email"
       aria-invalid="true" aria-describedby="email-erreur">`,
  choix: `<fieldset class="groupe">
  <legend>À qui vendez-vous ?</legend>
  <label class="choix"><input type="radio" name="clients" value="particuliers"> À des particuliers</label>
  <label class="choix"><input type="radio" name="clients" value="pros"> Uniquement à des professionnels</label>
</fieldset>`,
  recap: `<div class="recap-erreurs" tabindex="-1" aria-labelledby="titre-recap">
  <h2 id="titre-recap">2 points sont à corriger</h2>
  <ul><li><a href="#nom">Indiquez votre nom.</a></li> …</ul>
</div>
<!-- Au clic sur Envoyer : focus sur le récapitulatif ; chaque lien place le focus dans le champ. -->`,
  statut: `<p class="message-succes" role="status">C'est envoyé ! Vérifiez votre boîte de réception.</p>`,
  jauge: `<app-score-jauge [score]="65" palier="Une base à consolider" />`,
  carte: `<app-carte-probleme [probleme]="probleme" />`,
  progression: `<label for="progression">Pages analysées</label>
<progress id="progression" value="4" max="10"></progress>
<p role="status">4 pages analysées sur 10.</p>`,
  evitement: `<a class="lien-evitement" href="#contenu">Aller au contenu</a>
…
<main id="contenu" tabindex="-1">`,
};

@Component({
  selector: 'app-design-system',
  imports: [RouterLink, ScoreJauge, CarteProbleme],
  templateUrl: './design-system.html',
  styleUrl: './design-system.scss',
})
export class DesignSystem {
  protected readonly code = CODE;
  protected readonly exemple = EXEMPLE_PROBLEME;

  /** Re-measure when the OS theme changes: the table always shows the theme on screen. */
  private readonly sombre = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  protected readonly theme = computed(() => (this.sombre() ? 'sombre' : 'clair'));
  protected readonly contrastes = computed(() => {
    this.sombre();
    const styles = getComputedStyle(document.documentElement);
    const valeur = (token: string) => styles.getPropertyValue(token).trim();
    return PAIRES.map((p) => {
      const r = ratio(valeur(p.texte), valeur(p.fond));
      return { ...p, valeurTexte: valeur(p.texte), valeurFond: valeur(p.fond), ratio: r, niveau: r === null ? '—' : niveau(r, p.nonTexte) };
    });
  });

  constructor() {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const suivre = (e: MediaQueryListEvent) => this.sombre.set(e.matches);
    mq.addEventListener('change', suivre);

    // Public but kept out of search results (portfolio page, not the commercial offer).
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex' });
    inject(DestroyRef).onDestroy(() => {
      mq.removeEventListener('change', suivre);
      meta.removeTag('name="robots"');
    });
  }

  protected formatRatio(r: number | null) {
    return r === null ? '—' : `${r.toFixed(2).replace('.', ',')} : 1`;
  }
}
