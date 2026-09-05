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

import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { Field, FieldDescription, FieldError } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleMultiSelect } from 'components/redpanda-ui/components/multi-select';
import { useEffect, useId, useMemo, useState } from 'react';

import { api } from '../../../../../state/backend-api';
import type { Property } from '../../../../../state/connect/state';
import { ExpandableText } from '../../../../misc/expandable-text';

const setPropertyValue = (property: Property, value: Property['value']) => {
  property.value = value;
};

const incrementErrorIndex = (property: Property) => {
  property.currentErrorIndex += 1;
};

export const TopicInput = (p: { properties: Property[]; connectorType: 'sink' | 'source' }) => {
  // A TopicInput is rendered per property group, so a fixed id would collide.
  const regexCheckboxId = useId();
  const propsMap = useMemo(() => new Map(p.properties.map((prop) => [prop.name, prop])), [p.properties]);
  const topicsRegex = p.properties.find((x) => x.name === 'topics.regex');
  const initialSelection = topicsRegex?.value ? 'topics.regex' : 'topics';

  const [selected, setSelected] = useState(initialSelection);

  useEffect(() => {
    api.refreshTopics();
  }, []);

  const property = propsMap.get(selected);
  const isRegex = selected === 'topics.regex';

  if (!property) {
    return null;
  }

  const showErrors = property.errors.length > 0;
  const errors = showErrors ? property.errors : property.lastErrors;
  const errorToShow = showErrors ? errors[property.currentErrorIndex % errors.length] : undefined;
  const cycleError = showErrors
    ? () => {
        incrementErrorIndex(property);
      }
    : undefined;

  const selectedTopics = property.value ? property.value.toString().split(',').filter(Boolean) : [];
  // Union, not just `api.topics`: a chip for a topic that has since been deleted (or one rendered
  // before the topic list resolves) is only removable if its value is among the options.
  const topicOptions = [...new Set([...(api.topics?.map((x) => x.topicName) ?? []), ...selectedTopics])];

  return (
    <div className="grid grid-cols-1 gap-10">
      <Field className="relative">
        {propsMap.has('topics.regex') && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={isRegex}
              id={regexCheckboxId}
              onCheckedChange={(checked) => {
                setPropertyValue(property, '');
                setSelected(checked === true ? 'topics.regex' : 'topics');
              }}
            />
            <Label className="cursor-pointer" htmlFor={regexCheckboxId}>
              Use regular expressions
            </Label>
          </div>
        )}

        <FieldDescription>
          <ExpandableText maxChars={60}>{property.entry.definition.documentation}</ExpandableText>
        </FieldDescription>

        {/* A 'source' connector imports data into the cluster. So we let the user choose the name of the topic directly  */}
        {isRegex || p.connectorType === 'source' ? (
          <Input
            autoComplete="off"
            onChange={(e) => {
              setPropertyValue(property, e.target.value);
            }}
            spellCheck={false}
            value={String(property.value)}
          />
        ) : (
          <SimpleMultiSelect
            onValueChange={(values) => {
              setPropertyValue(property, values.join(','));
            }}
            options={topicOptions}
            value={selectedTopics}
            width="full"
          />
        )}

        {Boolean(showErrors) && <FieldError onClick={cycleError}>{errorToShow}</FieldError>}
      </Field>
    </div>
  );
};
