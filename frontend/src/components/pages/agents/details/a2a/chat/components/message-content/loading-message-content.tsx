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

import { Shimmer } from 'components/ai-elements/shimmer';
import { LightbulbIcon } from 'lucide-react';

/**
 * Renders loading state "Thinking..." shimmer
 */
export const LoadingMessageContent = () => (
  <div className="flex items-center gap-2">
    <LightbulbIcon className="size-4" />
    <Shimmer as="span">Thinking...</Shimmer>
  </div>
);
