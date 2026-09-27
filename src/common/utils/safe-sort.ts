export function safeSort(
  sortBy: string | undefined,
  sortOrder: string | undefined,
  whitelist: string[],
  fallback = 'createdAt',
): Record<string, 1 | -1> {
  const field = sortBy && whitelist.includes(sortBy) ? sortBy : fallback;
  const direction = sortOrder === 'asc' ? 1 : -1;
  return { [field]: direction };
}
