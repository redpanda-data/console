import { FormField } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import type { PropsWithoutRef } from 'react';

import type { Property } from '../../../../../state/connect/state';
import { ExpandableText } from '../../../../misc/ExpandableText';

const isRequiredError = (name: string) => `Required configuration "${name}" must be provided`;
const isEmpty = (property: Property) => property.value === '' || property.value == null;

export const ErrorWrapper = observer((props: PropsWithoutRef<{ property: Property; input: JSX.Element }>) => {
  const { property, input } = props;
  const isRequired = property.entry.definition.required;
  const showErrors = property.errors.length > 0;

  const errors = showErrors ? property.errors : property.lastErrors;

  const errorToShow = showErrors ? errors[property.currentErrorIndex % errors.length] : undefined;

  const cycleError = showErrors ? () => property.currentErrorIndex++ : undefined;

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
});
