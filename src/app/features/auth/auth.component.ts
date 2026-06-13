import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { firebaseErrorMessage } from '../../core/errors/firebase-error';

@Component({
  selector: 'app-auth',
  imports: [ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isRegistering = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.formBuilder.group({
    displayName: ['', [Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  toggleMode(): void {
    this.isRegistering.update((value) => !value);
    this.errorMessage.set('');
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

    try {
      if (this.isRegistering()) {
        await this.authService.register(displayName, email.trim(), password);
      } else {
        await this.authService.login(email.trim(), password);
      }

      await this.router.navigateByUrl('/');
    } catch (error: unknown) {
      this.errorMessage.set(firebaseErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.loginWithGoogle();
      await this.router.navigateByUrl('/');
    } catch (error: unknown) {
      this.errorMessage.set(firebaseErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
