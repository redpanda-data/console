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

import type { TopicMessage } from '../../../../../state/rest-interfaces';

export const messageKey = (m: Pick<TopicMessage, 'partitionID' | 'offset'>) => `${m.partitionID}-${m.offset}`;
