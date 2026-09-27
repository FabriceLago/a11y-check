import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { APP_NAME } from './api';
import { Theme } from './theme';

@Component({
  imports: [RouterOutlet, RouterLink],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly appName = APP_NAME;
  protected readonly theme = inject(Theme);

  /** href="#contenu" alone would navigate to "/#contenu" because of <base href="/">. */
  protected allerAuContenu(event: Event) {
    event.preventDefault();
    document.getElementById('contenu')?.focus();
  }
}
