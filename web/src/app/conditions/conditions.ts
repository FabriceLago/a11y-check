import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { incomplet, RESPONSABLE } from '../confidentialite/confidentialite';

@Component({
  selector: 'app-conditions',
  imports: [RouterLink],
  templateUrl: './conditions.html',
  styles: `
    .page {
      padding-top: var(--space-6);
    }
    section {
      max-width: var(--measure);
      margin-bottom: var(--space-5);
    }
    .avertissement {
      max-width: var(--measure);
      padding: var(--space-3) var(--space-4);
      border-left: 4px solid var(--c-critique);
      background: var(--c-critique-bg);
      color: var(--c-critique);
      font-weight: 700;
    }
    .maj {
      color: var(--c-text-muted);
    }
  `,
})
export class Conditions {
  protected readonly r = RESPONSABLE;
  protected readonly incomplet = incomplet(RESPONSABLE);
}
