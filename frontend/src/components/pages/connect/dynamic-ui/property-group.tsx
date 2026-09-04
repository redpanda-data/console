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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Link } from 'components/redpanda-ui/components/typography';

import type { ConfigPageProps } from './components';
import { TopicInput } from './forms/topic-input';
import { PropertyComponent } from './property-component';
import type { PropertyGroup } from '../../../../state/connect/state';

const topicsFields = ['topics', 'topics.regex'];

export const PropertyGroupComponent = (props: {
  group: PropertyGroup;
  allGroups: PropertyGroup[];
  showAdvancedOptions: boolean;
  connectorType: 'sink' | 'source';
  context: ConfigPageProps['context'];
}) => {
  const g = props.group;

  const filteredProperties = g.filteredProperties;

  if (filteredProperties.length === 0) {
    return null;
  }

  if (g.group.name === 'Transforms') {
    // Transforms + its sub groups
    const subGroups = props.allGroups
      .filter((subGroup) => subGroup.group.name?.startsWith('Transforms: '))
      .sort((a, b) => props.allGroups.indexOf(a) - props.allGroups.indexOf(b));

    return (
      <div className="dynamicInputs">
        {filteredProperties.map((p) => (
          <PropertyComponent key={p.name} property={p} />
        ))}

        <div className="col-span-4 pl-2">
          <Accordion variant="contained">
            {subGroups.map((subGroup) => (
              <AccordionItem key={subGroup.group.name} value={subGroup.group.name ?? ''}>
                <AccordionTrigger>
                  <div className="flex items-center gap-4">
                    {/* The group name was rendered twice here before the migration. */}
                    <span className="font-semibold text-heading-sm">{subGroup.group.name}</span>
                    <span className="issuesTag">{subGroup.propertiesWithErrors.length} issues</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PropertyGroupComponent
                    allGroups={props.allGroups}
                    connectorType={props.connectorType}
                    context={props.context}
                    group={subGroup}
                    showAdvancedOptions={props.showAdvancedOptions}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    );
  }
  // Normal group
  return (
    <div>
      {Boolean(g.group.name) && <h3 className="mt-8 mb-4 text-heading-md">{g.group.name}</h3>}

      {Boolean(g.group.description) && (
        <p className="text-body">
          {g.group.description}
          {g.group.documentation_link ? (
            <>
              {' '}
              <Link href={g.group.documentation_link}>Documentation</Link>
            </>
          ) : null}
        </p>
      )}

      <div>
        {
          <TopicInput
            connectorType={props.connectorType}
            properties={g.properties.filter((p) => topicsFields.any((v) => v === p.name))}
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
      <Separator className="my-10" />
    </div>
  );
};
