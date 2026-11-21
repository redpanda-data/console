import { isNonEmptyString } from '../utils/string-utils';

type PaginatedItems<T> = {
  items: T[];
  nextPageToken?: string;
};
export function collectPages<T>(
  fetchPage: (pageToken: string) => Promise<PaginatedItems<T> | undefined>
): Promise<T[]> {
  const items: T[] = [];
  const nextPage = async (pageToken: string): Promise<T[]> => {
    const page = await fetchPage(pageToken);
    if (!page) {
      return items;
    }
    items.push(...page.items);
    if (!isNonEmptyString(page.nextPageToken)) {
      return items;
    }
    return nextPage(page.nextPageToken);
  };
  return nextPage('');
}
