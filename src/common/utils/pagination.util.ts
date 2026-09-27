export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return { items, total, page, limit };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    hasNext: page * limit < total,
  };
}

export function skipTake(
  page: number,
  limit: number,
): {
  skip: number;
  limit: number;
} {
  return { skip: (page - 1) * limit, limit };
}
