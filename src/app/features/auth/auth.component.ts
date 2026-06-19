import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { firebaseErrorMessage } from '../../core/errors/firebase-error';
import { LanguageService } from '../../core/i18n/language.service';
import { LanguageToggleComponent } from '../../core/i18n/language-toggle.component';
import { TranslationKey } from '../../core/i18n/translations';
import { DismissibleMessageComponent } from '../../core/messages/dismissible-message.component';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    DismissibleMessageComponent,
    LanguageToggleComponent,
  ],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly isRegistering = signal(false);
  readonly isSubmitting = signal(false);
  readonly isResettingPassword = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly form = this.formBuilder.group({
    displayName: ['', [Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  toggleMode(): void {
    this.isRegistering.update((value) => !value);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { displayName, email, password } = this.form.getRawValue();

    if (this.isRegistering() && !displayName.trim()) {
      this.form.controls.displayName.setErrors({ required: true });
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      if (this.isRegistering()) {
        await this.authService.register(displayName, email.trim(), password);
      } else {
        await this.authService.login(email.trim(), password);
      }

      await this.navigateToDashboard();
    } catch (error: unknown) {
      this.errorMessage.set(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      await this.authService.loginWithGoogle();
      await this.navigateToDashboard();
    } catch (error: unknown) {
      this.errorMessage.set(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async resetPassword(): Promise<void> {
    const emailControl = this.form.controls.email;
    emailControl.markAsTouched();

    if (emailControl.invalid) {
      return;
    }

    this.isSubmitting.set(true);
    this.isResettingPassword.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      await this.authService.requestPasswordReset(emailControl.getRawValue().trim());
      this.successMessage.set(this.t('auth.resetEmailSent'));
    } catch (error: unknown) {
      if (this.hasFirebaseCode(error, 'auth/user-not-found')) {
        this.successMessage.set(this.t('auth.resetEmailSent'));
      } else {
        this.errorMessage.set(firebaseErrorMessage(error, this.language.current()));
      }
    } finally {
      this.isResettingPassword.set(false);
      this.isSubmitting.set(false);
    }
  }

  t(
    key: TranslationKey,
    parameters: Record<string, string | number> = {},
  ): string {
    return this.language.t(key, parameters);
  }

  private navigateToDashboard(): Promise<boolean> {
    return this.zone.run(() => this.router.navigateByUrl('/'));
  }

  private hasFirebaseCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      String(error.code) === code
    );
  }
}
