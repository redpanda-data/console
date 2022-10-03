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
import EmbeddedApp, { EmbeddedProps } from './EmbeddedApp';
// import { basePathS } from './utils/env';

const injector = async (parentElementId: string, props: EmbeddedProps) => {

const container = document.getElementById(parentElementId)  
const root = createRoot(container!)
  return  root.render(<EmbeddedApp {...props} />);

}

export default injector;
