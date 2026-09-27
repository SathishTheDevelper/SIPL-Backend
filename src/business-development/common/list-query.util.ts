import { FilterQuery, Types } from 'mongoose';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { skipTake } from '../../common/utils/pagination.util';
import { safeSort } from '../../common/utils/safe-sort';

export function buildListQuery<T>(
  query: FilteredQueryDto,
  searchFields: string[],
  sortWhitelist: string[],
): {
  filter: FilterQuery<T>;
  skip: number;
  limit: number;
  sort: Record<string, 1 | -1>;
} {
  const filter: FilterQuery<T> = {};
  if (query.status) {
    Object.assign(filter, { status: query.status });
  }
  if (query.owner) {
    Object.assign(filter, { owner: new Types.ObjectId(query.owner) });
  }
  if (query.projectType) {
    Object.assign(filter, { projectType: query.projectType });
  }
  if (query.dateFrom || query.dateTo) {
    const range: Record<string, Date> = {};
    if (query.dateFrom) range.$gte = new Date(query.dateFrom);
    if (query.dateTo) range.$lte = new Date(query.dateTo);
    Object.assign(filter, { createdAt: range });
  }
  if (query.q) {
    Object.assign(filter, {
      $or: searchFields.map((field) => ({
        [field]: { $regex: query.q, $options: 'i' },
      })),
    });
  }
  return {
    filter,
    ...skipTake(query.page, query.limit),
    sort: safeSort(query.sortBy, query.sortOrder, sortWhitelist),
  };
}
