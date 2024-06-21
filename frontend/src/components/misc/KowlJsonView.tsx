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

import { observer } from 'mobx-react';
import { CSSProperties } from 'react';
import { Box } from '@redpanda-data/ui';
import KowlEditor from './KowlEditor';

export const KowlJsonView = observer((props: {
    srcObj: object | string | null | undefined,
    style?: CSSProperties,
}) => {

    const str = typeof props.srcObj == 'string'
        ? props.srcObj
        : JSON.stringify(props.srcObj, undefined, 4);

    return <>
        <Box
            display="block"
            minHeight="40"
            maxHeight="45rem" // no chakra space equivalent exists
            height="96"
            style={props.style}
        >
            <KowlEditor
                value={str}
                language="json"
                options={{
                    readOnly: true,
                    // automaticLayout: false // too much lag on chrome
                }}
            />
        </Box>
    </>
});
