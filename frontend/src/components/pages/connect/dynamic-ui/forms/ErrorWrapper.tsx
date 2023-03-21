import { PropsWithoutRef } from 'react';
import { FormField } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { Property } from '../../../../../state/connect/state';

const isRequiredError = (name: string) => `Required configuration "${name}" must be provided`;
const isEmpty = (property: Property) => property.value == '' || property.value == null;

export const ErrorWrapper = observer(function(props: PropsWithoutRef<{ property: Property; input: JSX.Element }>) {
    const { property, input } = props;
    const isRequired = property.entry.definition.required;
    const showErrors = property.errors.length > 0;

    const errors = showErrors ? property.errors : property.lastErrors;

    const errorToShow = showErrors ? errors[property.currentErrorIndex % errors.length] : undefined;

    const cycleError = showErrors ? () => property.currentErrorIndex++ : undefined;

    return (
        <div>
            <FormField
                isInvalid={!!errorToShow || (isEmpty(property) && isRequired)}
                isRequired={isRequired}
                label={property.entry.definition.display_name}
                errorText={isEmpty(property) && isRequired ? errorToShow || isRequiredError(property.name) : errorToShow}
                description={property.entry.definition.documentation}
                onClick={cycleError}
            >
                {input}
            </FormField>
        </div>
    );
});
