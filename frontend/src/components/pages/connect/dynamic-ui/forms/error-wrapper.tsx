import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import type { JSX, PropsWithoutRef } from 'react';
import { useState } from 'react';

import type { Property } from '../../../../../state/connect/state';
import { ExpandableText } from '../../../../misc/expandable-text';

const isRequiredError = (name: string) => `Required configuration "${name}" must be provided`;
const isEmpty = (property: Property) => property.value === '' || property.value === null;

export const ErrorWrapper = (
  props: PropsWithoutRef<{
    property: Property;
    input: JSX.Element;
    /** id of the control `input` renders, so the label can point at it as Chakra's FormControl did. */
    inputId?: string;
    /** BOOLEAN/RADIO_GROUP properties sat inline with their label under Chakra's FormField. */
    orientation?: 'vertical' | 'horizontal';
  }>
) => {
  const { property, input, inputId, orientation = 'vertical' } = props;
  const [currentErrorIndex, setCurrentErrorIndex] = useState(0);
  const isRequired = property.entry.definition.required;
  const showErrors = property.errors.length > 0;

  const errors = showErrors ? property.errors : property.lastErrors;

  const errorToShow = showErrors ? errors[currentErrorIndex % errors.length] : undefined;

  const cycleError = showErrors ? () => setCurrentErrorIndex((i) => i + 1) : undefined;

  const errorText = isEmpty(property) && isRequired ? errorToShow || isRequiredError(property.name) : errorToShow;
  const isInvalid = Boolean(errorToShow) || (isEmpty(property) && isRequired);

  return (
    <div>
      {/*
        `onClick` on the field, as before: a property can carry several validation errors and the
        only way to see the rest is to click the field, which advances `currentErrorIndex`.
      */}
      <Field data-invalid={isInvalid || undefined} onClick={cycleError} orientation={orientation}>
        <FieldLabel htmlFor={inputId} required={isRequired}>
          {property.entry.definition.display_name}
        </FieldLabel>
        {/* Documentation between label and control, where Chakra's FormField put it. */}
        <FieldDescription>
          <ExpandableText maxChars={60}>{property.entry.definition.documentation}</ExpandableText>
        </FieldDescription>
        {/* Wrapped so `Field`'s vertical `[&>*]:w-full` lands here and not on a Switch. */}
        <div>{input}</div>
        {errorText ? <FieldError>{errorText}</FieldError> : null}
      </Field>
    </div>
  );
};
