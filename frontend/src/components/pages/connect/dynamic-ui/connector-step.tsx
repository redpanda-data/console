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

import { Box, Heading, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';

import type { ConfigPageProps } from './components';
import { PropertyGroupComponent } from './property-group';
import type { PropertyGroup } from '../../../../state/connect/state';
import type { ConnectorStep } from '../../../../state/rest-interfaces';

export const ConnectorStepComponent = observer(
  (props: {
    step: ConnectorStep;
    groups: PropertyGroup[];
    allGroups: PropertyGroup[];
    showAdvancedOptions: boolean;
    connectorType: 'sink' | 'source';
    context: ConfigPageProps['context'];
  }) => {
    const step = props.step;
    const groups = props.groups;

    const totalVisibleProperties = groups.sum((x) => x.filteredProperties.length);
    if (totalVisibleProperties === 0) {
      return null;
    }

    return (
      <Box>
        <Heading as="h3" mb="4" mt="8" size="md">
          {step.name}
        </Heading>

        {Boolean(step.description) && (
          <Text mb="4" size="sm">
            {step.description}
          </Text>
        )}

        {groups.map((g) => (
          <PropertyGroupComponent
            allGroups={props.allGroups}
            connectorType={props.connectorType}
            context={props.context}
            group={g}
            key={g.group.name}
            showAdvancedOptions={props.showAdvancedOptions}
          />
        ))}
      </Box>
    );
  }
);
