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
import { Collapse } from 'antd';
import { observer } from 'mobx-react';
import { PropertyImportance } from '../../../../state/restInterfaces';
import { PropertyGroup } from './components';
import { PropertyComponent } from './PropertyComponent';

export const PropertyGroupComponent = observer((props: { group: PropertyGroup, allGroups: PropertyGroup[], mode: 'simple' | 'advanced' }) => {
    const g = props.group;

    if (g.groupName == 'Transforms') {
        // Transforms + its sub groups

        const subGroups = props.allGroups
            .filter(g => g.groupName.startsWith('Transforms: '))
            .sort((a, b) => props.allGroups.indexOf(a) - props.allGroups.indexOf(b));

        return <div className="dynamicInputs">
            {g.properties.map(p => <PropertyComponent key={p.name} property={p} />)}

            <div style={{ gridColumn: 'span 4', paddingLeft: '8px' }}>

                <Collapse ghost bordered={false}>
                    {subGroups.map(subGroup =>
                        <Collapse.Panel
                            className={(subGroup.propertiesWithErrors.length > 0) ? 'hasErrors' : ''}
                            key={subGroup.groupName}
                            header={<div style={{ display: 'flex', alignItems: 'center', gap: '1em' }}>
                                <span style={{ fontSize: '1.1em', fontWeight: 600, fontFamily: 'Open Sans' }}>{subGroup.groupName}</span>
                                <span className="issuesTag">{subGroup.propertiesWithErrors.length} issues</span>
                            </div>}
                        >
                            <PropertyGroupComponent group={subGroup} allGroups={props.allGroups} mode={props.mode} />
                        </Collapse.Panel>
                    )}
                </Collapse>

            </div>
        </div>

    }
    else {
        // Normal group
        return <div className="dynamicInputs">
            {g.properties
                .filter(p => {
                    if (props.mode == 'advanced') {
                        // advanced mode shows all settings
                        return true;
                    } else {
                        // in simple mode, we only show props that are either high importance, or have an error
                        if (p.errors.length) return true;
                        if (p.entry.definition.importance == PropertyImportance.High) return true;
                    }

                    return false;
                })
                .map(p => <PropertyComponent key={p.name} property={p} />)}
        </div>
    }

});
