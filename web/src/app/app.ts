import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { APP_NAME } from './api';

@Component({
  imports: [RouterOutlet, RouterLink],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly appName = APP_NAME;

  /** href="#contenu" alone would navigate to "/#contenu" because of <base href="/">. */
  protected allerAuContenu(event: Event) {
    event.preventDefault();
    document.getElementById('contenu')?.focus();
  }
}
