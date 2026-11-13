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

import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { TaskState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import { TaskStatusBadge } from './task-status-badge';

test('a task that a failover ended reads Finished, not Unknown', () => {
  render(<TaskStatusBadge state={TaskState.FINISHED} taskId="source-topic-sync" />);

  expect(screen.getByTestId('task-status-badge-source-topic-sync')).toHaveTextContent('Finished');
});
