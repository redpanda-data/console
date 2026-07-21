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

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Link } from 'components/redpanda-ui/components/typography';
import type { FC } from 'react';

import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

export const SchemaNotConfiguredPage: FC = () => (
  <PageContent>
    <Section>
      <Empty data-testid="schema-not-configured">
        <EmptyHeader>
          <EmptyTitle>Not Configured</EmptyTitle>
          <EmptyDescription>
            Schema Registry is not configured in Redpanda Console.
            <br />
            To view all registered schemas, their documentation and their versioned history simply provide the
            connection credentials in the Redpanda Console config.
          </EmptyDescription>
        </EmptyHeader>
        <Link href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
          Redpanda Console Config Documentation
        </Link>
      </Empty>
    </Section>
  </PageContent>
);
