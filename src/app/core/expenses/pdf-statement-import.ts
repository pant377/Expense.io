import {
  ExpenseCategory,
  PaymentMethod,
  TransactionType,
  eurosToCents,
} from './expense.model';

export interface PdfStatementImportOptions {
  defaultCurrency?: string;
  defaultYear?: number;
  maxTransactions?: number;
}

export interface PdfStatementTransactionDraft {
  importId: string;
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  currency: string;
  occurredOn: string;
  sourceLine: string;
}

interface DateMatch {
  raw: string;
  index: number;
  endIndex: number;
  occurredOn: string;
}

interface AmountCandidate {
  raw: string;
  index: number;
  endIndex: number;
  amountCents: number;
  currency: string;
  explicitSign: -1 | 0 | 1;
  contextSign: -1 | 0 | 1;
}

interface PiraeusTransactionBlock {
  occurredOn: string;
  mainLine: string;
  detailLines: string[];
}

type StatementVariant = 'generic' | 'piraeus';

const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
const CURRENCY_PATTERN = '(?:EUR|USD|GBP|CHF|JPY|CAD|AUD|€|\\$|£|¥)';
const MONEY_PATTERN = new RegExp(
  [
    `(?<prefix>${CURRENCY_PATTERN})?`,
    '\\s*',
    '(?<openParen>\\()?',
    '\\s*',
    '(?<sign>[+-])?',
    '\\s*',
    '(?<number>(?:\\d{1,3}(?:[., ]\\d{3})+|\\d+)[.,]\\d{2})',
    '\\s*',
    '(?<closeParen>\\))?',
    '\\s*',
    `(?<suffix>${CURRENCY_PATTERN})?`,
  ].join(''),
  'giu',
);

const DATE_PATTERNS = [
  /(?<!\d)(?<year>19\d{2}|20\d{2})[./-](?<month>\d{1,2})[./-](?<day>\d{1,2})(?!\d)/giu,
  /(?<!\d)(?<day>\d{1,2})[./-](?<month>\d{1,2})[./-](?<year>\d{2}|19\d{2}|20\d{2})(?!\d)/giu,
  /(?<!\d)(?<day>\d{1,2})[./-](?<month>\d{1,2})(?![./-]\d)(?!\d)/giu,
  /(?<![\p{L}\d])(?<day>\d{1,2})\s+(?<monthName>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(?<year>19\d{2}|20\d{2}))?(?![\p{L}\d])/giu,
];

const MONTHS_BY_NAME: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const SUMMARY_LINE_PATTERN =
  /\b(opening|closing|available|previous|new|ledger)\s+balance\b|\bbalance\s+(brought|carried)\s+forward\b|\b(total|subtotal)\s+(debits?|credits?|transactions?|payments?|income|expenses?)\b|\bstatement\s+(period|date)\b|\bpage\s+\d+\b/iu;

const INCOME_PATTERN =
  /\b(salary|payroll|wage|pension|deposit|incoming|refund|reversal|interest|dividend|credit\s+transfer|received|payment\s+from)\b|\bcr\b/iu;

const EXPENSE_PATTERN =
  /\b(purchase|payment|withdrawal|fee|charge|commission|debit|direct\s+debit|standing\s+order|card|pos|atm|paid\s+to)\b|\bdr\b/iu;

const CATEGORY_KEYWORDS: readonly {
  category: ExpenseCategory;
  keywords: readonly string[];
}[] = [
  {
    category: 'Food',
    keywords: [
      'grocery',
      'groceries',
      'supermarket',
      'restaurant',
      'cafe',
      'coffee',
      'delivery',
      'bakery',
      'market',
      'lidl',
      'sklavenitis',
      'masoutis',
      'ab vassilopoulos',
    ],
  },
  {
    category: 'Transport',
    keywords: [
      'taxi',
      'uber',
      'bolt',
      'metro',
      'bus',
      'train',
      'tram',
      'ferry',
      'airline',
      'airport',
      'ticket',
    ],
  },
  {
    category: 'Vehicle',
    keywords: [
      'fuel',
      'petrol',
      'gas station',
      'parking',
      'toll',
      'service station',
      'shell',
      'bp',
      'eko',
      'avin',
    ],
  },
  {
    category: 'Home',
    keywords: [
      'rent',
      'electricity',
      'water',
      'utility',
      'internet',
      'telecom',
      'phone',
      'furniture',
      'ikea',
      'dei',
      'eydap',
    ],
  },
  {
    category: 'Health',
    keywords: [
      'pharmacy',
      'doctor',
      'hospital',
      'clinic',
      'dentist',
      'health',
      'medical',
      'diagnostic',
    ],
  },
  {
    category: 'Subscriptions',
    keywords: [
      'subscription',
      'netflix',
      'spotify',
      'apple.com',
      'google',
      'microsoft',
      'adobe',
      'icloud',
    ],
  },
  {
    category: 'FinancialExpenses',
    keywords: [
      'bank fee',
      'fee',
      'commission',
      'loan',
      'mortgage',
      'insurance',
      'tax',
      'interest charge',
    ],
  },
  {
    category: 'Investments',
    keywords: [
      'broker',
      'trading',
      'investment',
      'dividend',
      'etf',
      'stock',
      'fund',
    ],
  },
  {
    category: 'Gift',
    keywords: ['gift', 'donation', 'charity'],
  },
  {
    category: 'Leisure',
    keywords: [
      'cinema',
      'theatre',
      'hotel',
      'travel',
      'gym',
      'bar',
      'book',
      'game',
      'entertainment',
    ],
  },
];

const PIRAEUS_MAIN_LINE_PATTERN =
  /^\s*(?:(?<date>\d{2}\/\d{2}\/\d{2})\s+\k<date>\s+)?(?<code>\d{4}\s+[A-Z0-9]{4,6}\s+\d{7})\s+\k<code>\b/u;

const PIRAEUS_MONTH_LABELS = [
  ['ιανουαριου', '\u0399\u0391\u039d\u039f\u03a5\u0391\u03a1\u0399\u039f\u03a5'],
  ['φεβρουαριου', '\u03a6\u0395\u0392\u03a1\u039f\u03a5\u0391\u03a1\u0399\u039f\u03a5'],
  ['μαρτιου', '\u039c\u0391\u03a1\u03a4\u0399\u039f\u03a5'],
  ['απριλιου', '\u0391\u03a0\u03a1\u0399\u039b\u0399\u039f\u03a5'],
  ['μαιου', '\u039c\u0391\u03aa\u039f\u03a5'],
  ['ιουνιου', '\u0399\u039f\u03a5\u039d\u0399\u039f\u03a5'],
  ['ιουλιου', '\u0399\u039f\u03a5\u039b\u0399\u039f\u03a5'],
  ['αυγουστου', '\u0391\u03a5\u0393\u039f\u03a5\u03a3\u03a4\u039f\u03a5'],
  ['σεπτεμβριου', '\u03a3\u0395\u03a0\u03a4\u0395\u039c\u0392\u03a1\u0399\u039f\u03a5'],
  ['οκτωβριου', '\u039f\u039a\u03a4\u03a9\u0392\u03a1\u0399\u039f\u03a5'],
  ['νοεμβριου', '\u039d\u039f\u0395\u039c\u0392\u03a1\u0399\u039f\u03a5'],
  ['δεκεμβριου', '\u0394\u0395\u039a\u0395\u039c\u0392\u03a1\u0399\u039f\u03a5'],
] as const;

export function parsePdfStatementTransactions(
  text: string,
  options: PdfStatementImportOptions = {},
): PdfStatementTransactionDraft[] {
  const defaultCurrency = normalizeCurrency(options.defaultCurrency) || 'EUR';
  const defaultYear =
    options.defaultYear ?? inferStatementYear(text) ?? new Date().getFullYear();
  const maxTransactions = options.maxTransactions ?? 250;

  if (detectStatementVariant(text) === 'piraeus') {
    return parsePiraeusStatementTransactions(text, {
      defaultCurrency,
      defaultYear,
      maxTransactions,
    });
  }

  const statementProfile = detectStatementProfile(text);
  const seen = new Set<string>();
  const drafts: PdfStatementTransactionDraft[] = [];

  for (const [lineIndex, line] of statementLines(text).entries()) {
    if (drafts.length >= maxTransactions || isSummaryLine(line)) {
      continue;
    }

    const dateMatches = findDates(line, defaultYear);
    if (!dateMatches.length) {
      continue;
    }

    const dateMatch = dateMatches[0];
    const amounts = findAmounts(line, defaultCurrency).filter(
      (amount) => !dateMatches.some((date) => spansOverlap(date, amount)),
    );
    const selectedAmount = selectTransactionAmount(amounts, dateMatch);
    if (!selectedAmount) {
      continue;
    }

    const transactionType = inferTransactionType(
      line,
      selectedAmount,
      statementProfile,
    );
    const description = buildDescription(line, dateMatches, amounts);
    const duplicateKey = [
      dateMatch.occurredOn,
      selectedAmount.amountCents,
      transactionType,
      normalizeForMatching(description),
    ].join('|');

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    drafts.push({
      importId: `${lineIndex}-${stableHash(duplicateKey)}`,
      description,
      amountCents: selectedAmount.amountCents,
      category: inferCategory(line),
      transactionType,
      paymentMethod: inferPaymentMethod(line),
      currency: selectedAmount.currency,
      occurredOn: dateMatch.occurredOn,
      sourceLine: line,
    });
  }

  return drafts;
}

function parsePiraeusStatementTransactions(
  text: string,
  options: Required<
    Pick<PdfStatementImportOptions, 'defaultCurrency' | 'defaultYear' | 'maxTransactions'>
  >,
): PdfStatementTransactionDraft[] {
  const blocks = extractPiraeusTransactionBlocks(text, options.defaultYear);
  const seen = new Set<string>();
  const drafts: PdfStatementTransactionDraft[] = [];

  for (const [index, block] of blocks.entries()) {
    if (drafts.length >= options.maxTransactions) {
      break;
    }

    const amount = extractPiraeusAmount(block.mainLine);
    if (!amount) {
      continue;
    }

    const description = buildPiraeusDescription(block);
    const transactionType = inferPiraeusTransactionType(block);
    const duplicateKey = [
      block.occurredOn,
      amount.amountCents,
      transactionType,
      normalizeForMatching(description),
    ].join('|');

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    drafts.push({
      importId: `${index}-${stableHash(duplicateKey)}`,
      description,
      amountCents: amount.amountCents,
      category: inferCategory(description),
      transactionType,
      paymentMethod: inferPiraeusPaymentMethod(block),
      currency: amount.currency || options.defaultCurrency,
      occurredOn: block.occurredOn,
      sourceLine: [block.mainLine, ...block.detailLines].join(' | ').slice(0, 400),
    });
  }

  return drafts;
}

function statementLines(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' ').trimEnd())
    .filter((line) => line.trim().length > 0);
}

function findDates(line: string, defaultYear: number): DateMatch[] {
  const matches: DateMatch[] = [];

  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const groups = match.groups ?? {};
      const day = Number(groups['day']);
      const month = groups['monthName']
        ? MONTHS_BY_NAME[groups['monthName'].toLowerCase()]
        : Number(groups['month']);
      const year = groups['year'] ? normalizeYear(groups['year']) : defaultYear;
      const occurredOn = localDateKey(year, month, day);

      if (occurredOn) {
        matches.push({
          raw: match[0],
          index: match.index,
          endIndex: match.index + match[0].length,
          occurredOn,
        });
      }
    }
  }

  return matches.sort((left, right) => left.index - right.index);
}

function findAmounts(line: string, defaultCurrency: string): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  MONEY_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MONEY_PATTERN.exec(line)) !== null) {
    const groups = match.groups ?? {};
    const amount = parseMoney(groups['number'] ?? '');

    if (amount === null) {
      continue;
    }

    let amountCents: number;
    try {
      amountCents = eurosToCents(amount);
    } catch {
      continue;
    }

    const leadingWhitespaceLength = match[0].match(/^\s*/u)?.[0].length ?? 0;
    const raw = match[0].trim();
    const index = match.index + leadingWhitespaceLength;
    const endIndex = index + raw.length;
    const context = normalizeForMatching(
      line.slice(Math.max(0, index - 18), Math.min(line.length, endIndex + 18)),
    );
    const sign = groups['sign'];
    const isParenthesized = Boolean(groups['openParen'] && groups['closeParen']);
    const explicitSign = isParenthesized
      ? -1
      : sign === '-'
        ? -1
        : sign === '+'
          ? 1
          : 0;

    candidates.push({
      raw,
      index,
      endIndex,
      amountCents,
      currency:
        normalizeCurrency(groups['prefix']) ||
        normalizeCurrency(groups['suffix']) ||
        defaultCurrency,
      explicitSign,
      contextSign: inferSignFromContext(context),
    });
  }

  return candidates;
}

function selectTransactionAmount(
  amounts: AmountCandidate[],
  dateMatch: DateMatch,
): AmountCandidate | null {
  if (!amounts.length) {
    return null;
  }

  return (
    amounts.find((amount) => amount.explicitSign !== 0) ??
    amounts.find((amount) => amount.contextSign !== 0) ??
    amounts.find((amount) => amount.index >= dateMatch.endIndex) ??
    amounts[0]
  );
}

function parseMoney(value: string): number | null {
  const compact = value.replace(/\s/g, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const decimalSeparator =
    lastComma > -1 && lastDot > -1
      ? lastComma > lastDot
        ? ','
        : '.'
      : lastComma > -1
        ? ','
        : '.';
  const decimalIndex = compact.lastIndexOf(decimalSeparator);

  if (decimalIndex < 1 || compact.length - decimalIndex - 1 !== 2) {
    return null;
  }

  const whole = compact
    .slice(0, decimalIndex)
    .replace(/[.,]/g, '');
  const cents = compact.slice(decimalIndex + 1);
  const amount = Number(`${whole}.${cents}`);

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function buildDescription(
  line: string,
  dateMatches: DateMatch[],
  amounts: AmountCandidate[],
): string {
  const spans = [
    ...dateMatches,
    ...amounts,
  ].sort((left, right) => right.index - left.index);
  let description = line;

  for (const span of spans) {
    description =
      description.slice(0, span.index) + description.slice(span.endIndex);
  }

  description = description
    .replace(/\b(EUR|USD|GBP|CHF|JPY|CAD|AUD)\b|[€$£¥]/giu, ' ')
    .replace(/\b(value date|booking date|transaction date|debit|credit|dr|cr)\b/giu, ' ')
    .replace(/[|•]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();

  return (description || 'Imported transaction').slice(0, 120);
}

function inferTransactionType(
  line: string,
  amount: AmountCandidate,
  statementProfile: StatementProfile,
): TransactionType {
  const normalized = normalizeForMatching(line);
  const eurobankType = inferEurobankTransactionType(normalized);

  if (amount.explicitSign < 0 || amount.contextSign < 0) {
    return 'expense';
  }

  if (amount.explicitSign > 0 || amount.contextSign > 0) {
    return 'income';
  }

  if (eurobankType) {
    return eurobankType;
  }

  const statementColumn = amountStatementColumn(amount, statementProfile);
  if (statementColumn === 'credit') {
    return 'income';
  }

  if (statementColumn === 'debit') {
    return 'expense';
  }

  if (
    statementProfile.unsignedPositiveAmountsAreCredits &&
    statementProfile.debitColumnIndex === null &&
    statementProfile.creditColumnIndex === null
  ) {
    return 'income';
  }

  if (INCOME_PATTERN.test(normalized)) {
    return 'income';
  }

  if (EXPENSE_PATTERN.test(normalized)) {
    return 'expense';
  }

  return 'expense';
}

function inferEurobankTransactionType(
  normalizedLine: string,
): TransactionType | null {
  if (
    matchesNormalizedKeyword(normalizedLine, 'poi') ||
    hasNormalizedWordPrefix(normalizedLine, '\u03bc\u03b9\u03c3\u03b8') ||
    hasNormalizedWordPrefix(normalizedLine, 'misth')
  ) {
    return 'income';
  }

  if (matchesNormalizedKeyword(normalizedLine, 'poo')) {
    return 'expense';
  }

  return null;
}

function inferPaymentMethod(line: string): PaymentMethod {
  const normalized = normalizeForMatching(line);

  if (/\b(card|visa|mastercard|debit card|credit card|pos)\b/iu.test(normalized)) {
    return 'card';
  }

  if (/\b(cash|atm|withdrawal)\b/iu.test(normalized)) {
    return 'cash';
  }

  return 'bankTransfer';
}

function inferCategory(line: string): ExpenseCategory {
  const normalized = normalizeForMatching(line);
  const match = CATEGORY_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => matchesNormalizedKeyword(normalized, keyword)),
  );

  return match?.category ?? 'Other';
}

function inferSignFromContext(context: string): -1 | 0 | 1 {
  if (/\b(dr|debit|withdrawal|charge)\b/iu.test(context)) {
    return -1;
  }

  if (/\b(cr|salary|payroll|deposit|refund|incoming)\b/iu.test(context)) {
    return 1;
  }

  return 0;
}

function isSummaryLine(line: string): boolean {
  return SUMMARY_LINE_PATTERN.test(normalizeForMatching(line));
}

function inferStatementYear(text: string): number | null {
  const match = /\b(19\d{2}|20\d{2})\b/u.exec(text);

  return match ? Number(match[1]) : null;
}

function detectStatementVariant(text: string): StatementVariant {
  const lines = statementLines(text).slice(0, 120);
  const hasPiraeusHeader = lines.some((line) =>
    piraeusMergedText(line).includes('\u03a0\u0395\u0399\u03a1\u0391\u0399\u03a9\u03a3'),
  );
  const hasNoMailMarker = lines.some((line) => line.includes('NO MAIL'));
  const hasPiraeusTransactions = lines.some((line) =>
    PIRAEUS_MAIN_LINE_PATTERN.test(line),
  );
  const hasPiraeusCodes = lines.some((line) =>
    /\b(?:EL01P|XAPS|INC\d{2}|IIB01|SDD10)\b/u.test(line),
  );

  return hasPiraeusTransactions &&
    (hasPiraeusHeader || hasNoMailMarker || hasPiraeusCodes)
    ? 'piraeus'
    : 'generic';
}

interface StatementProfile {
  unsignedPositiveAmountsAreCredits: boolean;
  debitColumnIndex: number | null;
  creditColumnIndex: number | null;
  balanceColumnIndex: number | null;
}

function detectStatementProfile(text: string): StatementProfile {
  const normalized = normalizeForMatching(text);
  const headerLine = statementLines(text).find((line) => {
    const normalizedLine = normalizeForMatching(line);

    return (
      normalizedLine.includes('debit') &&
      normalizedLine.includes('credit') &&
      normalizedLine.includes('balance')
    );
  });
  const debitColumnIndex = headerLine?.search(/\bDebit\b/iu) ?? -1;
  const creditColumnIndex = headerLine?.search(/\bCredit\b/iu) ?? -1;
  const balanceColumnIndex = headerLine?.search(/\bBalance\b/iu) ?? -1;

  return {
    unsignedPositiveAmountsAreCredits:
      normalized.includes('debit credit balance') ||
      normalized.includes('χρεωση πιστωση υπολοιπο'),
    debitColumnIndex: debitColumnIndex >= 0 ? debitColumnIndex : null,
    creditColumnIndex: creditColumnIndex >= 0 ? creditColumnIndex : null,
    balanceColumnIndex: balanceColumnIndex >= 0 ? balanceColumnIndex : null,
  };
}

function amountStatementColumn(
  amount: AmountCandidate,
  statementProfile: StatementProfile,
): 'debit' | 'credit' | null {
  const { debitColumnIndex, creditColumnIndex, balanceColumnIndex } =
    statementProfile;

  if (
    debitColumnIndex === null ||
    creditColumnIndex === null ||
    balanceColumnIndex === null ||
    !(debitColumnIndex < creditColumnIndex && creditColumnIndex < balanceColumnIndex)
  ) {
    return null;
  }

  if (amount.index >= debitColumnIndex && amount.index < creditColumnIndex) {
    return 'debit';
  }

  if (amount.index >= creditColumnIndex && amount.index < balanceColumnIndex) {
    return 'credit';
  }

  return null;
}

function normalizeYear(value: string): number {
  const year = Number(value);

  if (value.length === 2) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }

  return year;
}

function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const upperValue = value.trim().toUpperCase();

  if (SUPPORTED_CURRENCIES.includes(upperValue)) {
    return upperValue;
  }

  switch (value.trim()) {
    case '€':
      return 'EUR';
    case '$':
      return 'USD';
    case '£':
      return 'GBP';
    case '¥':
      return 'JPY';
    default:
      return null;
  }
}

function normalizeForMatching(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function matchesNormalizedKeyword(normalizedValue: string, keyword: string): boolean {
  const normalizedKeyword = normalizeForMatching(keyword);

  if (!normalizedValue || !normalizedKeyword) {
    return false;
  }

  return ` ${normalizedValue} `.includes(` ${normalizedKeyword} `);
}

function hasNormalizedWordPrefix(normalizedValue: string, prefix: string): boolean {
  const normalizedPrefix = normalizeForMatching(prefix);

  if (!normalizedValue || !normalizedPrefix) {
    return false;
  }

  return normalizedValue
    .split(' ')
    .some((word) => word.startsWith(normalizedPrefix));
}

function extractPiraeusTransactionBlocks(
  text: string,
  defaultYear: number,
): PiraeusTransactionBlock[] {
  const blocks: PiraeusTransactionBlock[] = [];
  let currentBlock: PiraeusTransactionBlock | null = null;
  let activeOccurredOn: string | null = null;

  for (const line of statementLines(text)) {
    const match = PIRAEUS_MAIN_LINE_PATTERN.exec(line);

    if (match) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      const dateRaw = match.groups?.['date'];
      if (dateRaw) {
        activeOccurredOn = findDates(dateRaw, defaultYear)[0]?.occurredOn ?? null;
      }

      if (!activeOccurredOn) {
        currentBlock = null;
        continue;
      }

      currentBlock = {
        occurredOn: activeOccurredOn,
        mainLine: line,
        detailLines: [],
      };
      continue;
    }

    if (currentBlock) {
      currentBlock.detailLines.push(line);
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function extractPiraeusAmount(
  mainLine: string,
): Pick<AmountCandidate, 'amountCents' | 'currency'> | null {
  const amount = mainLine.match(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/u)?.[0];

  if (!amount) {
    return null;
  }

  const parsedAmount = parseMoney(amount);
  if (parsedAmount === null) {
    return null;
  }

  return {
    amountCents: eurosToCents(parsedAmount),
    currency: 'EUR',
  };
}

function inferPiraeusTransactionType(
  block: PiraeusTransactionBlock,
): TransactionType {
  const normalizedMain = normalizeForMatching(piraeusMergedText(block.mainLine)).replace(
    /\s+/g,
    '',
  );
  const normalizedDetails = normalizeForMatching(
    block.detailLines.map((line) => piraeusMergedText(line)).join(' '),
  ).replace(/\s+/g, '');

  if (
    /\bINC\d{2}\b/u.test(block.mainLine) ||
    normalizedMain.includes('ισερχομ') ||
    normalizedMain.includes('απολογ') ||
    normalizedDetails.includes('μισθοδοσια') ||
    normalizedDetails.includes('επιδοματηλεργασιας') ||
    normalizedDetails.includes('αποζημιωσηαδειας')
  ) {
    return 'income';
  }

  return 'expense';
}

function inferPiraeusPaymentMethod(
  block: PiraeusTransactionBlock,
): PaymentMethod {
  const normalizedMain = normalizeForMatching(piraeusMergedText(block.mainLine)).replace(
    /\s+/g,
    '',
  );
  const normalizedDetails = normalizeForMatching(
    block.detailLines.map((line) => piraeusJoinedText(line)).join(' '),
  );

  if (normalizedMain.includes('ατμ') || normalizedMain.includes('αναληψη')) {
    return 'cash';
  }

  if (
    block.mainLine.includes(' EL01P ') ||
    normalizedDetails.includes('google pay') ||
    normalizedDetails.includes('visa') ||
    normalizedDetails.includes('mastercard')
  ) {
    return 'card';
  }

  return 'bankTransfer';
}

function buildPiraeusDescription(block: PiraeusTransactionBlock): string {
  const candidates = block.detailLines
    .map((line) => piraeusDescriptionCandidate(line))
    .filter((candidate): candidate is string => Boolean(candidate));

  if (candidates.length) {
    return candidates[0].slice(0, 120);
  }

  return piraeusMainDescription(block.mainLine).slice(0, 120);
}

function piraeusDescriptionCandidate(line: string): string | null {
  const merged = piraeusMergedText(line);
  const joined = piraeusJoinedText(line);
  const normalizedMerged = normalizeForMatching(merged).replace(/\s+/g, '');

  if (!merged || isPiraeusNoiseLine(merged, joined, normalizedMerged)) {
    return null;
  }

  const payrollDescription = piraeusPayrollDescription(normalizedMerged);
  if (payrollDescription) {
    return payrollDescription;
  }

  if (joined.startsWith('B/O ')) {
    return joined;
  }

  if (/[A-Za-z]/u.test(joined) && /^[A-Za-z0-9/&'., -]+$/u.test(joined)) {
    return joined;
  }

  const latinDescription = piraeusLatinDescription(merged);
  if (latinDescription) {
    return latinDescription;
  }

  return null;
}

function isPiraeusNoiseLine(
  merged: string,
  joined: string,
  normalizedMerged: string,
): boolean {
  if (
    normalizedMerged.startsWith('ενδειξη') ||
    normalizedMerged.includes('mibrem') ||
    normalizedMerged.startsWith('rf') ||
    normalizedMerged.includes('nomail') ||
    normalizedMerged.includes('κινησηλογαριασμου') ||
    normalizedMerged.includes('στοιχειαπελατη') ||
    normalizedMerged.includes('αναλυτικαστοιχεια') ||
    normalizedMerged.includes('αριθμοςσελιδας') ||
    normalizedMerged.includes('προηγουμενουπολοιπο') ||
    normalizedMerged.includes('νεουπολοιπο') ||
    normalizedMerged.includes('λογαριασμοςσας')
  ) {
    return true;
  }

  if (
    /^\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s+EUR$/u.test(joined) ||
    /^\d{4}\s+GOOGLE-PAY$/u.test(joined) ||
    /^\d{12,}$/u.test(merged) ||
    /^\d{6}x{2,}\d{4}$/iu.test(merged)
  ) {
    return true;
  }

  return false;
}

function piraeusPayrollDescription(normalizedMerged: string): string | null {
  if (normalizedMerged.includes('μισθοδοσ')) {
    const month = PIRAEUS_MONTH_LABELS.find(([key]) =>
      normalizedMerged.includes(key),
    )?.[1];

    return month
      ? `\u039c\u0399\u03a3\u0398\u039f\u0394\u039f\u03a3\u0399\u0391 ${month}`
      : '\u039c\u0399\u03a3\u0398\u039f\u0394\u039f\u03a3\u0399\u0391';
  }

  if (
    normalizedMerged.includes('επιδομα') &&
    normalizedMerged.includes('τηλεργασ')
  ) {
    return '\u0395\u03a0\u0399\u0394\u039f\u039c\u0391 \u03a4\u0397\u039b\u0395\u03a1\u0393\u0391\u03a3\u0399\u0391\u03a3';
  }

  if (normalizedMerged.includes('δωρο') && normalizedMerged.includes('πασχ')) {
    return '\u0394\u03a9\u03a1\u039f \u03a0\u0391\u03a3\u03a7\u0391';
  }

  if (normalizedMerged.includes('επιδομα') && normalizedMerged.includes('αδει')) {
    return '\u0395\u03a0\u0399\u0394\u039f\u039c\u0391 \u0391\u0394\u0395\u0399\u0391\u03a3';
  }

  if (
    normalizedMerged.includes('αποζημιωσ') &&
    normalizedMerged.includes('αδει')
  ) {
    return '\u0391\u03a0\u039f\u0396\u0397\u039c\u0399\u03a9\u03a3\u0397 \u0391\u0394\u0395\u0399\u0391\u03a3';
  }

  return null;
}

function piraeusLatinDescription(merged: string): string | null {
  const matches = merged.match(/[A-Za-z][A-Za-z0-9/&'.,-]{2,}/gu) ?? [];
  const bestMatch = matches.sort((left, right) => right.length - left.length)[0];

  return bestMatch ?? null;
}

function piraeusMainDescription(mainLine: string): string {
  const normalizedMain = normalizeForMatching(piraeusMergedText(mainLine)).replace(
    /\s+/g,
    '',
  );

  if (normalizedMain.includes('μτφ') && normalizedMain.includes('απολογ')) {
    return '\u0395\u0399\u03a3\u0395\u03a1\u03a7\u039f\u039c\u0395\u039d\u0397 \u039c\u0395\u03a4\u0391\u03a6\u039f\u03a1\u0391';
  }

  if (normalizedMain.includes('ισερχομ')) {
    return '\u0395\u0399\u03a3\u0395\u03a1\u03a7\u039f\u039c\u0395\u039d\u039f \u0395\u039c\u0392\u0391\u03a3\u039c\u0391';
  }

  if (normalizedMain.includes('εξερχομ')) {
    return '\u0395\u039e\u0395\u03a1\u03a7\u039f\u039c\u0395\u039d\u039f \u0395\u039c\u0392\u0391\u03a3\u039c\u0391';
  }

  if (normalizedMain.includes('αναληψη')) {
    return 'ATM Withdrawal';
  }

  if (normalizedMain.includes('αγορα')) {
    return 'Card purchase';
  }

  if (normalizedMain.includes('προμηθεια')) {
    return 'Transfer fee';
  }

  if (normalizedMain.includes('εξοφληση')) {
    return 'Direct debit';
  }

  return 'Imported transaction';
}

function piraeusTokenSequence(line: string): string[] {
  const tokens = line.trim().split(/\s+/).filter(Boolean);

  return dedupeAdjacentDuplicateTokens(dedupeRepeatedTokenHalf(tokens));
}

function piraeusJoinedText(line: string): string {
  return piraeusTokenSequence(line).join(' ');
}

function piraeusMergedText(line: string): string {
  return piraeusTokenSequence(line).join('');
}

function dedupeRepeatedTokenHalf(tokens: string[]): string[] {
  if (tokens.length % 2 !== 0) {
    return tokens;
  }

  const halfLength = tokens.length / 2;

  for (let index = 0; index < halfLength; index += 1) {
    if (tokens[index] !== tokens[index + halfLength]) {
      return tokens;
    }
  }

  return tokens.slice(0, halfLength);
}

function dedupeAdjacentDuplicateTokens(tokens: string[]): string[] {
  const collapsed: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === tokens[index + 1]) {
      collapsed.push(tokens[index]);
      index += 1;
      continue;
    }

    collapsed.push(tokens[index]);
  }

  return collapsed;
}

function localDateKey(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function spansOverlap(
  left: { index: number; endIndex: number },
  right: { index: number; endIndex: number },
): boolean {
  return left.index < right.endIndex && right.index < left.endIndex;
}

function stableHash(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
