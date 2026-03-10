import { FormField } from '@redpanda-data/ui';
import type { PropsWithoutRef } from 'react';
import { useState } from 'react';

import type { Property } from '../../../../../state/connect/state';
import { ExpandableText } from '../../../../misc/expandable-text';

const isRequiredError = (name: string) => `Required configuration "${name}" must be provided`;
const isEmpty = (property: Property) => property.value === '' || property.value === null;

export const ErrorWrapper = (props: PropsWithoutRef<{ property: Property; input: JSX.Element }>) => {
  const { property, input } = props;
  const [currentErrorIndex, setCurrentErrorIndex] = useState(0);
  const isRequired = property.entry.definition.required;
  const showErrors = property.errors.length > 0;

  const errors = showErrors ? property.errors : property.lastErrors;

  const errorToShow = showErrors ? errors[currentErrorIndex % errors.length] : undefined;

  const cycleError = showErrors ? () => setCurrentErrorIndex((i) => i + 1) : undefined;

  return (
    <div>
      <FormField
        description={<ExpandableText maxChars={60}>{property.entry.definition.documentation}</ExpandableText>}
        errorText={isEmpty(property) && isRequired ? errorToShow || isRequiredError(property.name) : errorToShow}
        isInvalid={!!errorToShow || (isEmpty(property) && isRequired)}
        isRequired={isRequired}
        label={property.entry.definition.display_name}
        onClick={cycleError}
      >
        {input}
      </FormField>
    </div>
  );
};
