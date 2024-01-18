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

// import { IsDev } from '../../../../utils/env';
// import { DebugEditor } from './DebugEditor';
import { ConnectorPropertiesStore, PropertyGroup } from '../../../../state/connect/state';
import { observer } from 'mobx-react';
import { ConnectorStepComponent } from './ConnectorStep';
import { ConnectorStep } from '../../../../state/restInterfaces';
import { Box, RadioGroup, Skeleton, Switch } from '@redpanda-data/ui';
import KowlEditor from '../../../misc/KowlEditor';
import { api } from '../../../../state/backendApi';
import { clone } from '../../../../utils/jsonUtils';
import { useState } from 'react';
import { isEmbedded } from '../../../../config';

export interface ConfigPageProps {
    connectorStore: ConnectorPropertiesStore;
    context: 'CREATE' | 'EDIT';
}

export const ConfigPage: React.FC<ConfigPageProps> = observer(({ connectorStore, context }: ConfigPageProps) => {
    if (connectorStore.error)
        return (
            <div>
                <h3>Error</h3>
                <div className="codeBox">{connectorStore.error}</div>
            </div>
        );

    if (connectorStore.initPending) {
        return (
            <Skeleton mt={5} noOfLines={20} height={4} />
        );
    }

    if (connectorStore.allGroups.length == 0) return <div>debug: no groups</div>;

    // Find all steps
    const steps: {
        step: ConnectorStep,
        groups: PropertyGroup[],
    }[] = [];

    for (const step of connectorStore.connectorStepDefinitions) {
        const groups = connectorStore.allGroups.filter(g => g.step.stepIndex == step.stepIndex);
        steps.push({ step, groups });
    }

    return (
        <>
            <Box mb="8">
                <RadioGroup name="settingsMode"
                    value={connectorStore.viewMode}
                    onChange={x => connectorStore.viewMode = x}
                    options={[
                        { value: 'form', label: <Box mx="4">Form</Box> },
                        { value: 'json', label: <Box mx="4">JSON</Box> },
                    ]}
                />
            </Box>

            {connectorStore.viewMode == 'form'
                ? <>
                    <Switch
                        isChecked={connectorStore.showAdvancedOptions}
                        onChange={(s) => (connectorStore.showAdvancedOptions = s.target.checked)}
                    >
                        Show advanced options
                    </Switch>

                    {steps.map(({ step, groups }) => {
                        return <ConnectorStepComponent
                            key={step.stepIndex}
                            step={step}
                            groups={groups}
                            allGroups={connectorStore.allGroups}
                            showAdvancedOptions={connectorStore.showAdvancedOptions}
                            connectorType={connectorStore.connectorType}
                        />
                    })}
                </>
                : <>
                    <div style={{ margin: '0 auto 1.5rem' }}>
                        <ConnectorJsonEditor connectorStore={connectorStore} context={context} />
                    </div>
                </>
            }
        </>
    );
});

function ConnectorJsonEditor(p: {
    connectorStore: ConnectorPropertiesStore,
    context: 'CREATE' | 'EDIT'
}) {
    const connectorStore = p.connectorStore;

    // Initialize connector with existing data
    const [jsonText, setJsonText] = useState(() => {
        const configObj = connectorStore.getConfigObject();
        const connectorName = (configObj as any)?.name;

        if (connectorName) {
            console.log('trying to obtain initial config from existing connector...', { name: connectorName });
            const cluster = api.connectConnectors?.clusters?.first(c => c.clusterName == connectorStore.clusterName);
            const connector = cluster?.connectors.first(x => x.name == connectorName);
            if (connector) {
                console.log('success! found connector config', {
                    clusterName: connectorStore.clusterName,
                    connectorName,
                    config: clone(connector.config),
                });

                return JSON.stringify(connector.config, undefined, 4);
            }

            console.log('unable to find existing connector for known connector name!', {
                clusterName: connectorStore.clusterName,
                connectorName
            });
        }

        console.log('creating "new" config for connector', {
            name: connectorName,
            config: clone(configObj),
        });

        return JSON.stringify(configObj, undefined, 4);
    });


    return <KowlEditor
        language="json"
        value={jsonText}
        height="600px"
        onChange={x => {
            if (!x) return;
            setJsonText(x);
            connectorStore.jsonText = x;
            // trigger a validate always
            connectorStore.validate(connectorStore.getConfigObject());
        }}
        options={{
            readOnly: isEmbedded() && p.context == 'EDIT'
        }}
    />
}
