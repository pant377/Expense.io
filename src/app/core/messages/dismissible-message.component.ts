import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

export type DismissibleMessageType = 'error' | 'success';

@Component({
  selector: 'app-dismissible-message',
  template: `
    <span class="message-text">{{ message() }}</span>
    <button
      class="message-dismiss"
      type="button"
      [attr.aria-label]="dismissLabel()"
      (click)="dismissed.emit()"
    >
      &times;
    </button>
  `,
  host: {
    '[class.error-message]': "type() === 'error'",
    '[class.success-message]': "type() === 'success'",
    '[attr.role]': "type() === 'error' ? 'alert' : 'status'",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DismissibleMessageComponent {
  readonly message = input.required<string>();
  readonly dismissLabel = input.required<string>();
  readonly type = input<DismissibleMessageType>('error');
  readonly dismissed = output<void>();
}
