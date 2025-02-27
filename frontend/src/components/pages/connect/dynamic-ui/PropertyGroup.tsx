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

import { Accordion, Box, Divider, Flex, Heading, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import type { PropertyGroup } from '../../../../state/connect/state';
import { PropertyComponent } from './PropertyComponent';
import type { ConfigPageProps } from './components';
import { TopicInput } from './forms/TopicInput';

const topicsFields = ['topics', 'topics.regex'];

export const PropertyGroupComponent = observer(
  (props: {
    group: PropertyGroup;
    allGroups: PropertyGroup[];
    showAdvancedOptions: boolean;
    connectorType: 'sink' | 'source';
    context: ConfigPageProps['context'];
  }) => {
    const g = props.group;

    const filteredProperties = g.filteredProperties;

    if (filteredProperties.length === 0) return null;

    if (g.group.name === 'Transforms') {
      // Transforms + its sub groups
      const subGroups = props.allGroups
        .filter((g) => g.group.name?.startsWith('Transforms: '))
        .sort((a, b) => props.allGroups.indexOf(a) - props.allGroups.indexOf(b));

      return (
        <div className="dynamicInputs">
          {filteredProperties.map((p) => (
            <PropertyComponent key={p.name} property={p} />
          ))}

          <div style={{ gridColumn: 'span 4', paddingLeft: '8px' }}>
            <Accordion
              items={subGroups.map((subGroup) => ({
                heading: (
                  <Flex alignItems="center" gap={4}>
                    <span style={{ fontSize: '1.1em', fontWeight: 600, fontFamily: 'Open Sans' }}>
                      {subGroup.group.name}
                    </span>
                    <span style={{ fontSize: '1.1em', fontWeight: 600, fontFamily: 'Open Sans' }}>
                      {subGroup.group.name}
                    </span>
                    <span className="issuesTag">{subGroup.propertiesWithErrors.length} issues</span>
                  </Flex>
                ),
                description: (
                  <PropertyGroupComponent
                    group={subGroup}
                    allGroups={props.allGroups}
                    showAdvancedOptions={props.showAdvancedOptions}
                    connectorType={props.connectorType}
                    context={props.context}
                  />
                ),
              }))}
            />
          </div>
        </div>
      );
    }
    // Normal group
    return (
      <>
        <Box>
          {g.group.name && (
            <Heading as="h3" size="md" mt="8" mb="4">
              {g.group.name}
            </Heading>
          )}

          {g.group.description && (
            <Text>
              {g.group.description}
              {g.group.documentation_link && (
                <>
                  {' '}
                  <Link href={g.group.documentation_link}>Documentation</Link>
                </>
              )}
            </Text>
          )}

          <div>
            {
              <TopicInput
                properties={g.properties.filter((p) => topicsFields.any((v) => v === p.name))}
                connectorType={props.connectorType}
              />
            }
            {filteredProperties
              .filter((p) => topicsFields.every((v) => v !== p.name))
              .map((p) => {
                if (p.name === 'name' && props.context === 'EDIT') {
                  p.isDisabled = true;
                }
                return <PropertyComponent key={p.name} property={p} />;
              })}
          </div>
          <Divider my={10} />
        </Box>
      </>
    );
  },
);
