import { createFileRoute } from '@tanstack/react-router';
import { ShieldIcon } from 'components/icons';
import { ShadowLinkListPage } from 'components/pages/shadowlinks/list/shadowlink-list-page';

import { loadShadowlinks } from '../../components/pages/shadowlinks/list/load-shadowlinks';
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

import { z } from 'zod';

const searchSchema = z.object({
  tab: z.enum(['links', 'source']).optional().catch(undefined),
  /**
   * On the Cluster fence tab, opens a dialog: `exempt` its settings with `principal` added to the
   * exempt users, `fence` Fence, and `unfence` Unfence unless the cluster is already unfenced.
   */
  action: z.enum(['exempt', 'fence', 'unfence']).optional().catch(undefined),
  principal: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/shadowlinks/')({
  staticData: {
    title: 'Shadow Links',
    icon: ShieldIcon,
  },
  validateSearch: searchSchema,
  loader: ({ context }) => loadShadowlinks(context),
  component: ShadowLinkListPage,
});
