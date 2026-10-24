import { Skeleton, SkeletonGroup } from 'components/redpanda-ui/components/skeleton';

import { ContextsNotSupportedPage } from './contexts-not-supported-page';
import type { SchemaEditPageStatus } from './schema-edit-page';
import { SchemaNotConfiguredPage } from './schema-not-configured';
import PageContent from '../../misc/page-content';

/** What an edit page shows instead of its form until it is ready. */
export function SchemaEditPageFallback({ status }: { status: Exclude<SchemaEditPageStatus, 'ready'> }) {
  if (status === 'contexts-unsupported') {
    return <ContextsNotSupportedPage />;
  }
  if (status === 'not-configured') {
    return <SchemaNotConfiguredPage />;
  }
  return (
    <PageContent>
      <SkeletonGroup direction="vertical" spacing="lg">
        <Skeleton variant="heading" width="lg" />
        <Skeleton variant="text" width="full" />
        <Skeleton size="xl" width="full" />
        <Skeleton size="xl" width="full" />
        <Skeleton size="xl" width="full" />
      </SkeletonGroup>
    </PageContent>
  );
}
