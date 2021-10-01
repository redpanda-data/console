import { observer } from 'mobx-react';

import KowlEditor from '../../../misc/KowlEditor';


export const DebugEditor = observer((p: { observable: { jsonText: string } }) => {
    const obs = p.observable;

    return <div style={{ marginTop: '1.5em' }}>
        <h4>Debug Editor</h4>
        <KowlEditor
            language='json'

            value={obs.jsonText}
            onChange={(v, e) => {
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
