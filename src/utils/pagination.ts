// Pagination utility functions
export interface PaginationParams {
  page: number;
  limit: number;
  search: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function getPaginationParams(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 100)); // Max 100 items per page
  const search = query.search?.toString().trim() || '';
  const sortBy = query.sortBy?.toString().trim() || 'created_at';
  const sortOrder = (query.sortOrder?.toString().toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  return { page, limit, search, sortBy, sortOrder };
}

export function buildPaginationResult<T>(
  data: T[],
  totalItems: number,
  currentPage: number,
  itemsPerPage: number
): PaginationResult<T> {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return {
    data,
    pagination: {
      currentPage,
      totalPages,
      totalItems,
      itemsPerPage,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1
    }
  };
}

export function buildSearchCondition(search: string | undefined, searchFields: string[]): string {
  if (!search || searchFields.length === 0) return '';

  const conditions = searchFields.map(field => `${field} LIKE ?`).join(' OR ');
  return `(${conditions})`;
}

export function getSearchValues(search: string | undefined, searchFields: string[]): string[] {
  if (!search || searchFields.length === 0) return [];
  return searchFields.map(() => `%${search}%`);
}
