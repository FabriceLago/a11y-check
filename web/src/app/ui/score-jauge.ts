import { Component, computed, input } from '@angular/core';

type Niveau = 'bas' | 'moyen' | 'haut';
const ICONES: Record<Niveau, string> = { bas: '!', moyen: '◐', haut: '✓' };
const CIRCONFERENCE = 2 * Math.PI * 52; // r = 52 → ≈ 327
const ARC = CIRCONFERENCE * 0.75; // 270° dial, open at the bottom

/** The ring is decorative; the score and its label are plain text (never colour alone). */
@Component({
  selector: 'app-score-jauge',
  template: `
    <div class="jauge" [attr.data-niveau]="niveau()">
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle
          class="piste"
          cx="60"
          cy="60"
          r="52"
          [attr.stroke-dasharray]="piste"
          transform="rotate(135 60 60)"
        />
        <circle
          class="arc"
          cx="60"
          cy="60"
          r="52"
          [attr.stroke-dasharray]="dash()"
          transform="rotate(135 60 60)"
        />
      </svg>
      <p class="valeur">
        <span class="visually-hidden">Score&nbsp;: </span>
        <span class="nombre">{{ score() }}</span>
        <!-- The leading space matters: Angular strips whitespace between tags ("65sur 100"). -->
        <span class="sur"> sur 100</span>
      </p>
    </div>
    <p class="palier" [attr.data-niveau]="niveau()">
      <span class="palier__icone" aria-hidden="true">{{ icone() }}</span>
      {{ palier() }}
    </p>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: var(--space-2);
    }
    .jauge {
      position: relative;
      width: 11rem;
      aspect-ratio: 1;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    circle {
      fill: none;
      stroke-width: 12;
    }
    .piste {
      stroke: var(--c-score-piste);
    }
    circle {
      stroke-linecap: round;
    }
    .arc {
      animation: remplir 900ms ease-out;
      filter: drop-shadow(0 0 5px var(--c-niveau));
    }
    @keyframes remplir {
      from {
        stroke-dasharray: 0 327;
      }
    }
    [data-niveau='bas'] {
      --c-niveau: var(--c-score-bas);
    }
    [data-niveau='moyen'] {
      --c-niveau: var(--c-score-moyen);
    }
    [data-niveau='haut'] {
      --c-niveau: var(--c-score-haut);
    }
    .arc {
      stroke: var(--c-niveau);
    }
    .valeur {
      position: absolute;
      inset: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .nombre {
      font-size: var(--fs-score);
      font-weight: 700;
    }
    .sur {
      font-size: var(--fs-sm);
      color: var(--c-text-muted);
      margin-top: var(--space-1);
    }
    .palier {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-1) var(--space-3);
      border: 2px solid var(--c-niveau);
      border-radius: 999px;
      font-weight: 700;
      text-align: center;
    }
    .palier__icone {
      display: inline-grid;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      background: var(--c-niveau);
      color: var(--c-bg);
      font-size: var(--fs-sm);
    }
  `,
})
export class ScoreJauge {
  readonly score = input.required<number>();
  readonly palier = input.required<string>();

  // Same thresholds as palier() in server/src/report.ts.
  protected readonly niveau = computed<Niveau>(() =>
    this.score() < 50 ? 'bas' : this.score() < 80 ? 'moyen' : 'haut',
  );
  protected readonly icone = computed(() => ICONES[this.niveau()]);
  // Real user units, not pathLength: Chromium ignores pathLength while a CSS animation drives the dasharray.
  protected readonly piste = `${ARC} ${CIRCONFERENCE}`;
  protected readonly dash = computed(() => `${(this.score() / 100) * ARC} ${CIRCONFERENCE}`);
}
