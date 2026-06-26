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
 * Module Federation bridge entry consumed by Cloud UI (a React 18 host).
 *
 * Console runs React 19 while Cloud UI stays on React 18. A shared React
 * singleton cannot span both majors, so this remote stops sharing
 * react/react-dom (see module-federation.config.ts) and exposes its app through
 * the React bridge instead: the bridge mounts ConsoleApp into a host-provided
 * DOM node using Console's own React 19 `createRoot`, decoupling the two React
 * instances. The `/v19` entrypoint wires `react-dom/client`'s `createRoot`; the
 * default entry calls the legacy `render` API and throws on React 19.
 *
 * The prop contract is unchanged. The bridge forwards the same ConsoleAppProps
 * (getAccessToken, clusterId, navigateTo, onRouteChange, onSidebarItemsChange,
 * ...) straight through to ConsoleApp and re-renders the existing root in place
 * when they change (no remount), so the host<->remote navigation sync keeps
 * working.
 */
export default createBridgeComponent<ConsoleAppProps>({ rootComponent: ConsoleApp });
