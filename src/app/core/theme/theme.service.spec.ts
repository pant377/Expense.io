import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const storageKey = 'expense-io-theme';

  beforeEach(() => {
    localStorage.removeItem(storageKey);
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('applies and stores the selected theme', () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark');

    expect(service.isDark()).toBeTrue();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(storageKey)).toBe('dark');
  });

  it('toggles back to light mode', () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');

    service.toggle();

    expect(service.current()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
