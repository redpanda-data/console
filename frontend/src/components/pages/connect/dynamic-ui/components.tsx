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

/* eslint-disable no-useless-escape */
import { Skeleton } from 'antd';
// import { IsDev } from '../../../../utils/env';
import { OptionGroup } from '../../../../utils/tsxUtils';
// import { DebugEditor } from './DebugEditor';
import { ConnectorPropertiesStore } from '../../../../state/connect/state';
import { observer } from 'mobx-react';
import { ConnectorStepComponent } from './ConnectorStep';

export interface ConfigPageProps {
    connectorStore: ConnectorPropertiesStore;
}

export const ConfigPage: React.FC<ConfigPageProps> = observer(({ connectorStore }: ConfigPageProps) => {
    if (connectorStore.error)
        return (
            <div>
                <h3>Error</h3>
                <div className="codeBox">{connectorStore.error}</div>
            </div>
        );

    if (connectorStore.initPending)
        return (
            <div>
                <Skeleton loading={true} active={true} paragraph={{ rows: 20, width: '100%' }} />
            </div>
        );

    if (connectorStore.allGroups.length == 0) return <div>debug: no groups</div>;

    // Find all steps
    const steps = connectorStore.allGroups
        .groupInto(x => x.step)
        .orderBy(x => {
            const stepIndex = connectorStore.connectorStepDefinitions.findIndex(step => step == x.key);
            return stepIndex;
        });

    return (
        <>
            <OptionGroup
                style={{ marginBottom: '1rem' }}
                label={undefined}
                options={{
                    'Show Basic Options': 'simple',
                    'Show All Options': 'advanced',
                }}
                value={connectorStore.advancedMode}
                onChange={(s) => (connectorStore.advancedMode = s)}
            />

            {steps.map(x => {
                const step = x.key;
                const groups = x.items;

                return <ConnectorStepComponent
                    key={step.name}
                    step={step}
                    groups={groups}
                    allGroups={connectorStore.allGroups}
                    mode={connectorStore.advancedMode}
                />
            })}

            {/* {IsDev && <DebugEditor observable={connectorStore} />} */}
        </>
    );
});
