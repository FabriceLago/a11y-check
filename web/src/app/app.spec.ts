import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }),
  );

  it('starts with a skip link that moves focus to the main content', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const main = document.createElement('main');
    main.id = 'contenu';
    main.tabIndex = -1;
    root.appendChild(main);

    const first = root.querySelector('a')!;
    expect(first.textContent).toContain('Aller au contenu');
    first.click();
    expect(document.activeElement).toBe(main);
  });
});
