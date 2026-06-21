import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LanguageService } from './language.service';

@Component({
  selector: 'app-language-toggle',
  template: `
    <button
      class="language-toggle"
      type="button"
      [attr.aria-label]="language.t('language.switch')"
      [attr.title]="language.t('language.switch')"
      (click)="language.toggle()"
    >
      {{ language.current() === 'en' ? 'ΕΛ' : 'EN' }}
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .language-toggle {
      min-width: 42px;
      min-height: 38px;
      padding: 0.45rem 0.65rem;
      color: var(--primary-dark);
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid var(--line);
      border-radius: 10px;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .language-toggle:hover {
      background: white;
      border-color: #bfd4d1;
    }

    .language-toggle:focus-visible {
      outline: 3px solid rgba(10, 124, 116, 0.18);
      outline-offset: 2px;
    }

    @media (max-width: 600px) {
      .language-toggle {
        width: 42px;
        height: 42px;
        padding: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageToggleComponent {
  readonly language = inject(LanguageService);
}
