import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LanguageToggleComponent } from '../../core/i18n/language-toggle.component';
import { TranslationKey } from '../../core/i18n/translations';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-about',
  imports: [AsyncPipe, RouterLink, LanguageToggleComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent {
  private readonly authService = inject(AuthService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);
  readonly user$ = this.authService.user$;

  readonly githubUrl = 'https://github.com/pant377';
  readonly linkedInUrl = 'https://www.linkedin.com/in/pappantelis/';

  t(
    key: TranslationKey,
    parameters: Record<string, string | number> = {},
  ): string {
    return this.language.t(key, parameters);
  }
}
