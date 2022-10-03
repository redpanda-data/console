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

import KowlEditor from '../../../misc/KowlEditor';


export const DebugEditor = observer((p: { observable: { jsonText: string } }) => {
    const obs = p.observable;

    return <div style={{ marginTop: '1.5em' }}>
        <h4>Debug Editor</h4>
        <KowlEditor
            language="json"

            value={obs.jsonText}
            onChange={(v) => {
                if (v) {
                    if (!obs.jsonText && !v)
                        return; // dont replace undefiend with empty (which would trigger our 'autorun')
                    obs.jsonText = v;
                }
            }}
            height="300px"
        />
    </div>

});
