const GREEK_MONTHS = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];

const GREEK_DATE_MONTHS = [
  'Ιανουαρίου',
  'Φεβρουαρίου',
  'Μαρτίου',
  'Απριλίου',
  'Μαΐου',
  'Ιουνίου',
  'Ιουλίου',
  'Αυγούστου',
  'Σεπτεμβρίου',
  'Οκτωβρίου',
  'Νοεμβρίου',
  'Δεκεμβρίου',
];

const GREEK_SHORT_MONTHS = [
  'Ιαν',
  'Φεβ',
  'Μαρ',
  'Απρ',
  'Μάι',
  'Ιουν',
  'Ιουλ',
  'Αυγ',
  'Σεπ',
  'Οκτ',
  'Νοε',
  'Δεκ',
];

export function formatMonthName(
  locale: string,
  month: number,
  style: 'long' | 'short' = 'long',
  context: 'standalone' | 'date' = 'standalone',
): string {
  if (locale.startsWith('el')) {
    if (style === 'short') {
      return GREEK_SHORT_MONTHS[month];
    }

    return context === 'date' ? GREEK_DATE_MONTHS[month] : GREEK_MONTHS[month];
  }

  return new Intl.DateTimeFormat(locale, { month: style }).format(
    new Date(2026, month, 1),
  );
}
