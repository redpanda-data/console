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

import { createBridgeComponent } from '@module-federation/bridge-react/v19';

import ConsoleApp from './console-app';
import type { ConsoleAppProps } from './types';

/**
 * Module Federation bridge consumed by Cloud UI, a React 18 host.
 *
 * Console runs React 19, and no shared React singleton can span both majors — so this remote stops
 * sharing react/react-dom (module-federation.config.ts) and mounts ConsoleApp into a host-provided
 * node with its own `createRoot`. Import the `/v19` entrypoint; the default one calls the legacy
 * `render` and throws on React 19. ConsoleAppProps pass straight through, re-rendering the existing
 * root in place rather than remounting, so host<->remote navigation sync survives prop changes.
 */
export default createBridgeComponent<ConsoleAppProps>({ rootComponent: ConsoleApp });
