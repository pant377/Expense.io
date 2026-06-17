import {
  parsePdfStatement,
  parsePdfStatementTransactions,
} from './pdf-statement-import';

describe('PDF statement import', () => {
  it('detects signed card expenses and bank-transfer income', () => {
    const transactions = parsePdfStatementTransactions(
      [
        '01/06/2026 POS LIDL ATHENS -42.30 EUR',
        '02/06/2026 Payroll ACME SA +2,500.00 EUR',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions.length).toBe(2);
    expect(transactions[0]).toEqual(
      jasmine.objectContaining({
        occurredOn: '2026-06-01',
        description: 'POS LIDL ATHENS',
        amountCents: 4230,
        category: 'Food',
        transactionType: 'expense',
        paymentMethod: 'card',
        currency: 'EUR',
      }),
    );
    expect(transactions[1]).toEqual(
      jasmine.objectContaining({
        occurredOn: '2026-06-02',
        amountCents: 250000,
        transactionType: 'income',
        paymentMethod: 'bankTransfer',
      }),
    );
  });

  it('handles European amount formatting and ignores balance columns', () => {
    const transactions = parsePdfStatementTransactions(
      '03/06/2026 SUPERMARKET SKLAVENITIS 42,30 1.234,56',
      { defaultCurrency: 'EUR' },
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0]).toEqual(
      jasmine.objectContaining({
        description: 'SUPERMARKET SKLAVENITIS',
        amountCents: 4230,
        category: 'Food',
        transactionType: 'expense',
      }),
    );
  });

  it('uses the supplied year when statement rows omit it', () => {
    const transactions = parsePdfStatementTransactions(
      '15/06 ATM Withdrawal (60.00)',
      { defaultCurrency: 'EUR', defaultYear: 2026 },
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0]).toEqual(
      jasmine.objectContaining({
        occurredOn: '2026-06-15',
        amountCents: 6000,
        transactionType: 'expense',
        paymentMethod: 'cash',
      }),
    );
  });

  it('skips summary lines and duplicate rows', () => {
    const transactions = parsePdfStatementTransactions(
      [
        '01/06/2026 Opening balance 1,234.56',
        '04/06/2026 Coffee shop -3.20',
        '04/06/2026 Coffee shop -3.20',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0].description).toBe('Coffee shop');
  });

  it('parses month-name dates and ISO currency codes', () => {
    const transactions = parsePdfStatementTransactions(
      '5 Jun 2026 Dividend payment GBP 12.50',
      { defaultCurrency: 'EUR' },
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0]).toEqual(
      jasmine.objectContaining({
        occurredOn: '2026-06-05',
        amountCents: 1250,
        currency: 'GBP',
        category: 'Investments',
        transactionType: 'income',
      }),
    );
  });

  it('parses Eurobank short-year debit rows without keeping the value date', () => {
    const transactions = parsePdfStatementTransactions(
      [
        'Transaction Date',
        'Description | Value Date | Debit | Credit | Balance',
        '16/12/24 | POO KAFES | 16/12/24 | -5,00 | EUR 1.234,56',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0]).toEqual(
      jasmine.objectContaining({
        occurredOn: '2024-12-16',
        description: 'POO KAFES',
        amountCents: 500,
        currency: 'EUR',
        transactionType: 'expense',
      }),
    );
  });

  it('uses Eurobank debit-credit headers to classify unsigned credit rows', () => {
    const transactions = parsePdfStatementTransactions(
      [
        'Description | Value Date | Debit | Credit | Balance',
        '18/12/24 | POI IRIS PAYMENT | 18/12/24 | 30,00 | EUR 1.264,56',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions.length).toBe(1);
    expect(transactions[0]).toEqual(
      jasmine.objectContaining({
        occurredOn: '2024-12-18',
        description: 'POI IRIS PAYMENT',
        amountCents: 3000,
        transactionType: 'income',
      }),
    );
  });

  it('uses aligned Debit and Credit columns when Eurobank omits empty cells', () => {
    const transactions = parsePdfStatementTransactions(
      [
        '                              Description     Value Date     Debit          Credit        Balance',
        ' 02/01/26   POO KAFES          02/01/26        5,00                         EUR 14.799,53',
        ' 02/01/26   POI IRIS PAYMENT   02/01/26                       70,00        EUR 14.869,53',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions.length).toBe(2);
    expect(transactions[0]).toEqual(
      jasmine.objectContaining({
        description: 'POO KAFES',
        amountCents: 500,
        transactionType: 'expense',
      }),
    );
    expect(transactions[1]).toEqual(
      jasmine.objectContaining({
        description: 'POI IRIS PAYMENT',
        amountCents: 7000,
        transactionType: 'income',
      }),
    );
  });

  it('classifies known Eurobank incoming descriptions as income', () => {
    const greekSalary =
      '\u039c\u0399\u03a3\u0398. \u0394\u0395\u039a\u0395\u0395\u039c\u0392\u03a1\u0399\u039f\u03a5';
    const transactions = parsePdfStatementTransactions(
      [
        '                              Description     Value Date     Debit          Credit        Balance',
        ' 02/01/26   POI IRIS PAYMENT               02/01/26                          70,00           EUR 14.804,53',
        ` 09/01/26   ${greekSalary}               09/01/26                         1.370,00          EUR 15.991,34`,
        ' 12/01/26   POI STINIS GEORGIOS          12/01/26                          13,00           EUR 16.004,34',
        ' 05/01/26   POI PASCHALIDIS AKILAS       05/01/26                          12,00           EUR 14.782,23',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions).toEqual([
      jasmine.objectContaining({
        description: 'POI IRIS PAYMENT',
        amountCents: 7000,
        transactionType: 'income',
      }),
      jasmine.objectContaining({
        description: greekSalary,
        amountCents: 137000,
        transactionType: 'income',
      }),
      jasmine.objectContaining({
        description: 'POI STINIS GEORGIOS',
        amountCents: 1300,
        transactionType: 'income',
      }),
      jasmine.objectContaining({
        description: 'POI PASCHALIDIS AKILAS',
        amountCents: 1200,
        transactionType: 'income',
      }),
    ]);
  });

  it('detects the latest Eurobank balance column as a statement balance', () => {
    const result = parsePdfStatement(
      [
        '                              Description     Value Date     Debit          Credit        Balance',
        ' 02/01/26   POO KAFES          02/01/26        5,00                         EUR 14.799,53',
        ' 02/01/26   POI IRIS PAYMENT   02/01/26                       70,00        EUR 14.869,53',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(result.balance).toEqual(
      jasmine.objectContaining({
        amountCents: 1486953,
        currency: 'EUR',
        effectiveDate: '2026-01-02',
        institution: 'eurobank',
      }),
    );
  });

  it('detects Greek balance label rows as statement balances', () => {
    const result = parsePdfStatement(
      [
        '01/06/2026 Coffee shop -3.20',
        '\u03a5\u03c0\u03cc\u03bb\u03bf\u03b9\u03c0\u03bf 1.234,56 EUR',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(result.balance).toEqual(
      jasmine.objectContaining({
        amountCents: 123456,
        currency: 'EUR',
        effectiveDate: '2026-06-01',
      }),
    );
  });

  it('parses Piraeus card-purchase blocks using the merchant detail line', () => {
    const transactions = parsePdfStatementTransactions(
      [
        '     28/01/26 28/01/26 2960 EL01P 1939208 2960 EL01P 1939208 Λ Λ Π Π Κ Α Κ Α Γ Γ Ο Ο Ρ Ρ ΑΜΕΚ ΑΜΕΚ Α Α Ρ Ρ Τ Τ Α Α 28/01/26 28/01/26 9.48 9.48 1 1 0 0 , , 3 3 4 4 1 1 . . 0 0 9 9 Π Π Ι Ι',
        '                                         Ε Ε Ν Ν Δ Δ Ε Ε Ι Ι Ξ Ξ Η Η : P : P O O 2 2 6 6 0 0 2 2 5 5 0 0 0 0 0 0 7 7 2 2 8 8 6 6 0 0 6 6',
        '                                         LIDL EVOSMOS LIDL EVOSMOS',
        '                                         9,48 EUR 9,48 EUR',
        '                                         430589xxxxxx2001 430589xxxxxx2001',
        '                                         5411 GOOGLE-PAY 5411 GOOGLE-PAY',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions).toEqual([
      jasmine.objectContaining({
        occurredOn: '2026-01-28',
        description: 'LIDL EVOSMOS',
        amountCents: 948,
        category: 'Food',
        transactionType: 'expense',
        paymentMethod: 'card',
      }),
    ]);
  });

  it('parses Piraeus same-day rows without repeated dates and marks incoming transfers as income', () => {
    const transactions = parsePdfStatementTransactions(
      [
        '     12/01/26 12/01/26 2960 EL01P 0456412 2960 EL01P 0456412 Λ Λ Π Π Κ Α Κ Α Γ Γ Ο Ο Ρ Ρ ΑΜΕΚ ΑΜΕΚ Α Α Ρ Ρ Τ Τ Α Α 12/01/26 12/01/26 50.00 50.00 1 1 1 1 , , 5 5 3 3 9 9 . . 5 5 2 2 Π Π Ι Ι',
        '                                         PAYZY BY COSMOTE MAROUSI PAYZY BY COSMOTE MAROUSI',
        '                2926 INC10 0004356 2926 INC10 0004356 Ε Ε ΜΒΕ ΜΒΕ Ι Ι Σ Σ Ε Ε Ρ Ρ Χ Χ Ο Ο Μ. Μ. Ε Ε ΜΒ ΜΒ Α Α Σ Σ ΜΑ ΜΑ 5.00 5.00 1 1 0 0 , , 6 6 3 3 1 1 . . 5 5 2 2 Π Π Ι Ι',
        '                                         Ε Ε Ν Ν Δ Δ Ε Ε Ι Ι Ξ Ξ Η Η : F : F 2 2 6 6 T T I I 6 6 0 0 1 1 7 7 5 5 0 0 2 2 8 8 3 3',
        '                                         B/O PASCHALIDIS AKYLAS B/O PASCHALIDIS AKYLAS',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions).toEqual([
      jasmine.objectContaining({
        occurredOn: '2026-01-12',
        description: 'PAYZY BY COSMOTE MAROUSI',
        amountCents: 5000,
        transactionType: 'expense',
      }),
      jasmine.objectContaining({
        occurredOn: '2026-01-12',
        description: 'B/O PASCHALIDIS AKYLAS',
        amountCents: 500,
        transactionType: 'income',
        paymentMethod: 'bankTransfer',
      }),
    ]);
  });

  it('parses Piraeus payroll transfer blocks as income', () => {
    const transactions = parsePdfStatementTransactions(
      [
        '     30/01/26 30/01/26 2960 EL01P 0426437 2960 EL01P 0426437 Λ Λ Π Π Κ Α Κ Α Γ Γ Ο Ο Ρ Ρ ΑΜΕΚ ΑΜΕΚ Α Α Ρ Ρ Τ Τ Α Α 30/01/26 30/01/26 50.00 50.00 1 1 0 0 , , 2 2 9 9 1 1 . . 0 0 9 9 Π Π Ι Ι',
        '                                         PAYZY BY COSMOTE MAROUSI PAYZY BY COSMOTE MAROUSI',
        '                2960 IIB01 0090811 2960 IIB01 0090811 ΜΤ ΜΤ Φ ΜΕ Φ ΜΕ Τ Τ Α Α Φ. Φ. Α Α Π Π Ο Ο Λ Λ Ο Ο Γ Γ . . Τ Τ Ρ Ρ 1,800.54 1,800.54 1 1 2 2 , , 1 1 0 0 4 4 . . 6 6 3 3 Π Π Ι Ι',
        '                                         Ε Ε Ν Ν Δ Δ Ε Ε Ι Ι Ξ Ξ Η Η : E : E B B 2 2 6 6 0 0 1 1 3 3 0 0 4 4 0 0 6 6 5 5 2 2 8 8 0 0 3 3',
        '                                         Μ Μ Ι Ι Σ Σ Θ Θ Ο Ο Δ Δ Ο Ο Σ Σ Ι Ι Α Ι Α Ι Α Α Ν Ν Ο Ο Υ Υ Α Α Ρ Ρ Ι Ι Ο Ο Υ Σ Υ Σ Τ Τ Ι Ι Ν Ν Η Η Σ V Σ V I I D D A A V V O O',
        '                                         A A E Μ E Μ ε ε τ τ α α φ φ ο ο ρ ρ ά μ ά μ έ έ σ σ ω P ω P i i r r a a e e u u s e b s e b a a n n k k i i n n g g',
      ].join('\n'),
      { defaultCurrency: 'EUR' },
    );

    expect(transactions[1]).toEqual(
      jasmine.objectContaining({
        occurredOn: '2026-01-30',
        description: 'ΜΙΣΘΟΔΟΣΙΑ ΙΑΝΟΥΑΡΙΟΥ',
        amountCents: 180054,
        transactionType: 'income',
        paymentMethod: 'bankTransfer',
      }),
    );
  });
});
