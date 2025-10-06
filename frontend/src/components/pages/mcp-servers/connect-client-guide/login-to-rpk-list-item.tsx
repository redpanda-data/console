/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { ListItem } from 'components/redpanda-ui/components/typography';

export const LoginToRpkListItem = () => (
  <ListItem>
    Login to Redpanda Cloud:
    <DynamicCodeBlock code="rpk cloud login" lang="bash" />
  </ListItem>
);
