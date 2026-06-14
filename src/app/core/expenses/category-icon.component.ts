import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ExpenseCategory } from './expense.model';

@Component({
  selector: 'app-category-icon',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      @switch (category()) {
        @case ('Food') {
          <path d="M7 3v7M4.5 3v4.5A2.5 2.5 0 0 0 7 10v11M9.5 3v4.5A2.5 2.5 0 0 1 7 10"></path>
          <path d="M17 3c-2 2-3 4.5-3 7.5V13h3v8M17 3v10"></path>
        }
        @case ('Transport') {
          <rect x="5" y="3" width="14" height="16" rx="3"></rect>
          <path d="M5 9h14M8 15h.01M16 15h.01M8 19v2M16 19v2"></path>
        }
        @case ('Vehicle') {
          <path d="m5 16-1.5-1.5 1.8-5A2 2 0 0 1 7.2 8h9.6a2 2 0 0 1 1.9 1.5l1.8 5L19 16"></path>
          <path d="M4 16h16v3H4zM7 19v2M17 19v2M7.5 13h.01M16.5 13h.01"></path>
        }
        @case ('Home') {
          <path d="m3 11 9-8 9 8"></path>
          <path d="M5 10v11h14V10M9 21v-7h6v7"></path>
        }
        @case ('Health') {
          <path d="M20.8 5.7a5.3 5.3 0 0 0-7.5 0L12 7l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 22l8.8-8.8a5.3 5.3 0 0 0 0-7.5Z"></path>
          <path d="M7 13h3l1.2-3 1.8 6 1-3h3"></path>
        }
        @case ('Leisure') {
          <path d="M8.5 8h7a5.5 5.5 0 0 1 5.3 7l-.8 2.8a2.5 2.5 0 0 1-4.3.9L14.3 17H9.7l-1.4 1.7a2.5 2.5 0 0 1-4.3-.9L3.2 15a5.5 5.5 0 0 1 5.3-7Z"></path>
          <path d="M8 11v4M6 13h4M16.5 12h.01M18.5 14h.01"></path>
        }
        @case ('Subscriptions') {
          <path d="M20 7h-5V2"></path>
          <path d="M20 7a8 8 0 1 0 1.4 8M4 17h5v5"></path>
          <path d="M4 17a8 8 0 0 0 14.4-5"></path>
        }
        @case ('FinancialExpenses') {
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"></path>
          <path d="M9 8h6M9 12h6M9 16h3"></path>
        }
        @case ('Investments') {
          <path d="M4 19V9M10 19V5M16 19v-7M22 19V3"></path>
          <path d="m3 8 6-5 6 5 7-6"></path>
        }
        @case ('Gift') {
          <rect x="3" y="9" width="18" height="12" rx="1"></rect>
          <path d="M12 9v12M3 13h18M7.5 9C5 9 4 7.8 4 6.4 4 5.1 5 4 6.4 4 8.3 4 10 6.2 12 9M16.5 9C19 9 20 7.8 20 6.4 20 5.1 19 4 17.6 4 15.7 4 14 6.2 12 9"></path>
        }
        @default {
          <circle cx="5" cy="12" r="1"></circle>
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-grid;
      width: 1em;
      height: 1em;
      place-items: center;
    }

    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryIconComponent {
  readonly category = input.required<ExpenseCategory>();
}
