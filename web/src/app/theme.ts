import { Injectable, signal } from '@angular/core';

export type NomTheme = 'sombre' | 'clair';
const CLE = 'theme';

function lire(): NomTheme {
  try {
    return localStorage.getItem(CLE) === 'clair' ? 'clair' : 'sombre';
  } catch {
    return 'sombre'; // storage blocked (private window…): default theme
  }
}

/** Dark by default; the choice is remembered per browser. Applied synchronously so
 *  anything that reads computed colours right after a switch sees the new theme. */
@Injectable({ providedIn: 'root' })
export class Theme {
  readonly actuel = signal<NomTheme>(lire());

  constructor() {
    this.appliquer(this.actuel());
  }

  basculer() {
    const t: NomTheme = this.actuel() === 'sombre' ? 'clair' : 'sombre';
    this.appliquer(t);
    this.actuel.set(t);
    try {
      localStorage.setItem(CLE, t);
    } catch {
      // not remembered, still applied
    }
  }

  private appliquer(t: NomTheme) {
    if (t === 'clair') document.documentElement.dataset['theme'] = 'light';
    else delete document.documentElement.dataset['theme'];
  }
}
