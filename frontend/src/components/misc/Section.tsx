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

import React, { ReactNode } from 'react';
import { ChakraProps, Section as ChakraSection } from '@redpanda-data/ui';

// Note: this component is intended to be temporary until all components are migrated @redpanda-data/ui
function Section(props: { children: ReactNode; id?: string; } & ChakraProps) {
    return <ChakraSection px={6} py={6} {...props} />;
}

export default Section;
