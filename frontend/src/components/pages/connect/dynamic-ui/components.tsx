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
import { Collapse, Skeleton } from 'antd';
// import { IsDev } from '../../../../utils/env';
import { OptionGroup } from '../../../../utils/tsxUtils';
import { PropertyGroupComponent } from './PropertyGroup';
// import { DebugEditor } from './DebugEditor';
import { ConnectorPropertiesStore } from '../../../../state/connect/state';
import { observer } from 'mobx-react';

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

    const defaultExpanded = connectorStore.allGroups[0].groupName;

    const rootGroups = connectorStore.allGroups
        // The individual transforms sub-groups are not rendered on the root level, they're nested under the "Transforms" group
        .filter((g) => !g.groupName.startsWith('Transforms: '))
        // if properties get filtered, and it results in a group being empty, don't render it
        .filter((g) => g.filteredProperties.length > 0);

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
            <Collapse defaultActiveKey={defaultExpanded} ghost bordered={false}>
                {rootGroups.map((g) => (
                    <Collapse.Panel
                        className={g.propertiesWithErrors.length > 0 ? 'hasErrors' : ''}
                        key={g.groupName}
                        header={
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1em' }}>
                                <span style={{ fontSize: 'larger', fontWeight: 600, fontFamily: 'Open Sans' }}>{g.groupName}</span>
                                <span className="issuesTag">{g.propertiesWithErrors.length} issues</span>
                            </div>
                        }
                    >
                        <PropertyGroupComponent group={g} allGroups={connectorStore.allGroups} mode={connectorStore.advancedMode} />
                    </Collapse.Panel>
                ))}
            </Collapse>

            {/* {IsDev && <DebugEditor observable={connectorStore} />} */}
        </>
    );
});
