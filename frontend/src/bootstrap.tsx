/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */
import { createRoot } from 'react-dom/client';
import EmbeddedApp from './EmbeddedApp';

import getBuildTimeUtc from './utils/dateUtils';

import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';
import { appGlobal } from './state/appGlobal';

if (process.env.REACT_APP_SENTRY_DSN && process.env.REACT_APP_SENTRY_TENANT) {
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    normalizeDepth: process.env.REACT_APP_SENTRY_NORMALIZE_DEPTH
      ? parseInt(process.env.REACT_APP_SENTRY_NORMALIZE_DEPTH, 10)
      : 10,
    integrations: [
      new BrowserTracing({
        routingInstrumentation: Sentry.reactRouterV5Instrumentation(
          appGlobal.history
        ),
      }),
    ],
    tracesSampleRate: process.env.REACT_APP_SENTRY_TRACE_RATE
      ? parseInt(process.env.REACT_APP_SENTRY_TRACE_RATE, 10)
      : 1.0,
    release: `console-ui-${
      process.env.REACT_APP_BUILD_SHA
    }-${getBuildTimeUtc()}`,
    environment: process.env.REACT_APP_SENTRY_TENANT,
  });
}

const rootElement = document.getElementById('root');
const root = createRoot(rootElement!);
root.render(<EmbeddedApp />);
