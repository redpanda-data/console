import { expect, test } from '@rstest/core';
import type { Topic } from 'state/rest-interfaces';
import { render, screen } from 'test-utils';

import { TopicListPagination } from './topic-list-pagination';
import { useDataTable } from '../../redpanda-ui/components/data-table/data-table-features';

const TOPICS: Topic[] = Array.from({ length: 21 }, (_, index) => ({
  topicName: `orders-${index}`,
  isInternal: false,
  partitionCount: 3,
  replicationFactor: 3,
  cleanupPolicy: 'delete',
  documentation: 'NOT_CONFIGURED',
  logDirSummary: { totalSizeBytes: 1024, replicaErrors: null, hint: null },
  allowedActions: undefined,
}));

function PendingPageRepair({ pageIndex }: { pageIndex: number }) {
  const table = useDataTable({
    data: TOPICS,
    columns: [],
    state: { pagination: { pageIndex, pageSize: 10 } },
    autoResetPageIndex: false,
  });
  return <TopicListPagination table={table} />;
}

test.each([
  [99, 'Page 3 of 3'],
  [-1, 'Page 1 of 3'],
])('bounds the page label while URL page %s is being repaired', (pageIndex, label) => {
  render(<PendingPageRepair pageIndex={pageIndex} />);

  expect(screen.getByText(label)).toBeVisible();
});
