import { paginateItems } from './pagination';

describe('paginateItems', () => {
  const items = Array.from({ length: 323 }, (_, index) => index + 1);

  it('returns the requested page and the correct item range', () => {
    const pagination = paginateItems(items, 1, 12);

    expect(pagination.items).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(pagination.currentPage).toBe(1);
    expect(pagination.totalPages).toBe(27);
    expect(pagination.startItem).toBe(1);
    expect(pagination.endItem).toBe(12);
  });

  it('returns the remaining items on the final page', () => {
    const pagination = paginateItems(items, 27, 12);

    expect(pagination.items.length).toBe(11);
    expect(pagination.items[0]).toBe(313);
    expect(pagination.items.at(-1)).toBe(323);
    expect(pagination.startItem).toBe(313);
    expect(pagination.endItem).toBe(323);
  });

  it('clamps a page that no longer exists after deletion', () => {
    const pagination = paginateItems(items.slice(0, 12), 5, 12);

    expect(pagination.currentPage).toBe(1);
    expect(pagination.items.length).toBe(12);
  });

  it('builds compact controls for a middle page', () => {
    const pagination = paginateItems(items, 14, 12);

    expect(pagination.controls.map((control) => control.label)).toEqual([
      '1',
      '...',
      '13',
      '14',
      '15',
      '...',
      '27',
    ]);
  });
});
