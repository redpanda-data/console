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

import KowlEditor from '../../../misc/kowl-editor';

const updateJsonText = (obs: { jsonText: string }, v: string) => {
  obs.jsonText = v;
};

export const DebugEditor = (p: { observable: { jsonText: string } }) => {
  const obs = p.observable;

  return (
    <div style={{ marginTop: '1.5em' }}>
      <h4>Debug Editor</h4>
      <KowlEditor
        height="300px"
        language="json"
        onChange={(v) => {
          if (v) {
            if (!(obs.jsonText || v)) {
              return; // dont replace undefiend with empty (which would trigger our 'autorun')
            }
            updateJsonText(obs, v);
          }
        }}
        value={obs.jsonText}
      />
    </div>
  );
};
