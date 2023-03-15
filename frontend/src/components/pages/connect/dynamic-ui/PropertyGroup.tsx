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
import { Box, Heading, Link, Text } from '@redpanda-data/ui';
import { Collapse } from 'antd';
import { observer } from 'mobx-react';
import { PropertyGroup } from '../../../../state/connect/state';
import { PropertyComponent } from './PropertyComponent';

export const PropertyGroupComponent = observer((props: { group: PropertyGroup, allGroups: PropertyGroup[], mode: 'simple' | 'advanced' }) => {
    const g = props.group;

    const filteredProperties = g.filteredProperties;

    if (filteredProperties.length == 0)
        return null;


    if (g.group.name == 'Transforms') {
        // Transforms + its sub groups
        const subGroups = props.allGroups
            .filter(g => g.group.name?.startsWith('Transforms: '))
            .sort((a, b) => props.allGroups.indexOf(a) - props.allGroups.indexOf(b));

        return <div className="dynamicInputs">
            {filteredProperties.map(p => <PropertyComponent key={p.name} property={p} />)}

            <div style={{ gridColumn: 'span 4', paddingLeft: '8px' }}>

                <Collapse ghost bordered={false}>
                    {subGroups.map(subGroup =>
                        <Collapse.Panel
                            className={(subGroup.propertiesWithErrors.length > 0) ? 'hasErrors' : ''}
                            key={subGroup.group.name ?? '<null>'}
                            header={<div style={{ display: 'flex', alignItems: 'center', gap: '1em' }}>
                                <span style={{ fontSize: '1.1em', fontWeight: 600, fontFamily: 'Open Sans' }}>{subGroup.group.name}</span>
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
        return <Box>
            {g.group.name &&
                <Heading as="h3" size="md" mt="8" mb="4">{g.group.name}</Heading>
            }

            {g.group.description
                && <Text>
                    {g.group.description}
                    {' '}
                    {g.group.documentation_link &&
                        <Link href={g.group.documentation_link}>Documentation</Link>}
                </Text>
            }

            <div className="dynamicInputs">
                {filteredProperties.map(p => <PropertyComponent key={p.name} property={p} />)}
            </div>
        </Box>
    }

});
