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
import { initTheme } from 'components/redpanda-ui/components/theme-provider';
import { createRoot } from 'react-dom/client';

import App from './app';

// Pre-paint theme stamp; ThemeProvider in app.tsx re-applies the same values, so keep the two in step.
initTheme({ defaultTheme: 'light' });

const rootElement = document.getElementById('root');
// biome-ignore lint/style/noNonNullAssertion: bootstrapping the app
const root = createRoot(rootElement!);
root.render(<App />);
