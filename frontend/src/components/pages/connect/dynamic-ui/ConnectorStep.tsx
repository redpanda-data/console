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
import { Box, Heading, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { PropertyGroup } from '../../../../state/connect/state';
import { ConnectorStep } from '../../../../state/restInterfaces';
import { PropertyGroupComponent } from './PropertyGroup';

export const ConnectorStepComponent = observer((props: { step: ConnectorStep, groups: PropertyGroup[], allGroups: PropertyGroup[], showAdvancedOptions: boolean }) => {
    const step = props.step;
    const groups = props.groups;

    const totalVisibleProperties = groups.sum(x => x.filteredProperties.length);
    if (totalVisibleProperties == 0)
        return null;

    return <Box>
        <Heading as="h3" size="md" mt="8" mb="4">{step.name}</Heading>

        {step.description &&
            <Text size="sm" mb="4">{step.description}</Text>}

        {groups.map((g, i) =>
            <PropertyGroupComponent
                key={i}
                group={g}
                allGroups={props.allGroups}
                showAdvancedOptions={props.showAdvancedOptions}
            />
        )}
    </Box>

});
