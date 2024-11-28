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
import EmbeddedApp, { type EmbeddedProps } from './EmbeddedApp';

const injector = async (parentElementId: string, props: EmbeddedProps) => {
  const container = document.getElementById(parentElementId);
  // biome-ignore lint/style/noNonNullAssertion: bootstrapping the app for embedded mode
  const root = createRoot(container!);
  root.render(<EmbeddedApp {...props} />);
  return root;
};

export default injector;
