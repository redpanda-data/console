/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Text } from 'components/redpanda-ui/components/typography';

import PageContent from '../../misc/page-content';

export function ContextsNotSupportedPage() {
  return (
    <PageContent>
      <div className="flex flex-col items-center gap-4" data-testid="contexts-not-supported">
        <Text className="font-bold text-lg">Not Supported</Text>
        <Text className="text-center">Schema Registry contexts are not supported in this cluster.</Text>
      </div>
    </PageContent>
  );
}
