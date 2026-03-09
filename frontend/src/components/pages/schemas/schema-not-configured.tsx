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

import { Empty, Text } from '@redpanda-data/ui';
import { Link } from 'components/redpanda-ui/components/typography';
import type { FC } from 'react';

import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

export const SchemaNotConfiguredPage: FC = () => (
  <PageContent>
    <Section>
      <div className="flex flex-col items-center gap-4" data-testid="schema-not-configured">
        <Empty description="Not Configured" />
        <Text textAlign="center">
          Schema Registry is not configured in Redpanda Console.
          <br />
          To view all registered schemas, their documentation and their versioned history simply provide the connection
          credentials in the Redpanda Console config.
        </Text>
        <Link href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
          Redpanda Console Config Documentation
        </Link>
      </div>
    </Section>
  </PageContent>
);
