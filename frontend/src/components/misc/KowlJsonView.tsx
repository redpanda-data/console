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

import { Box } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import type { CSSProperties } from 'react';
import KowlEditor from './KowlEditor';

export const KowlJsonView = observer(
  (props: {
    srcObj: object | string | null | undefined;
    style?: CSSProperties;
  }) => {
    const str = typeof props.srcObj === 'string' ? props.srcObj : JSON.stringify(props.srcObj, undefined, 4);

    return (
      <Box
        display="block"
        minHeight="40"
        maxHeight="45rem" // no chakra space equivalent exists
        height="96"
        style={props.style}
        position="relative"
      >
        {/*
         We have a problem in Safari with Monaco editor, when used with automaticLayout: true, which is a default,
         it causes an infinite loop in Safari. It recalculates in a wrong way, changes the dimensions of a parent
         and that triggers ResizeObserver again (see the internal implementation).
         We tried to play with overflow, boxSizing, even manually using ResizeObserver.
         Changing the parent to absolutely positioned element works around the issue for now.
         */}
        <Box position="absolute" h="full" w="full">
          <KowlEditor
            value={str}
            language="json"
            options={{
              readOnly: true,
              // automaticLayout: false // too much lag on chrome
            }}
          />
        </Box>
      </Box>
    );
  },
);
