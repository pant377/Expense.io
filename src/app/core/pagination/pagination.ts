export interface PaginationControl {
  key: string;
  page: number | null;
  label: string;
}

export interface PaginationResult<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startItem: number;
  endItem: number;
  controls: PaginationControl[];
}

export function paginateItems<T>(
  items: T[],
  requestedPage: number,
  pageSize: number,
): PaginationResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);

  return {
    items: items.slice(startIndex, endIndex),
    currentPage,
    totalPages,
    totalItems,
    startItem: totalItems ? startIndex + 1 : 0,
    endItem: endIndex,
    controls: buildPaginationControls(currentPage, totalPages),
  };
}

function buildPaginationControls(
  currentPage: number,
  totalPages: number,
): PaginationControl[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => pageControl(index + 1));
  }

  if (currentPage <= 4) {
    return [
      ...[1, 2, 3, 4, 5].map(pageControl),
      ellipsisControl('after'),
      pageControl(totalPages),
    ];
  }

  if (currentPage >= totalPages - 3) {
    return [
      pageControl(1),
      ellipsisControl('before'),
      ...Array.from({ length: 5 }, (_, index) => pageControl(totalPages - 4 + index)),
    ];
  }

  return [
    pageControl(1),
    ellipsisControl('before'),
    pageControl(currentPage - 1),
    pageControl(currentPage),
    pageControl(currentPage + 1),
    ellipsisControl('after'),
    pageControl(totalPages),
  ];
}

function pageControl(page: number): PaginationControl {
  return {
    key: `page-${page}`,
    page,
    label: String(page),
  };
}

function ellipsisControl(position: 'before' | 'after'): PaginationControl {
  return {
    key: `ellipsis-${position}`,
    page: null,
    label: '...',
  };
}
