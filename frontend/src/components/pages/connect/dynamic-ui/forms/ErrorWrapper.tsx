import { FormField } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { Property } from '../../../../../state/connect/state';

export const ErrorWrapper = observer(function(props: { property: Property; input: JSX.Element }) {
    const { property, input } = props;
    const showErrors = property.errors.length > 0;

    const errors = showErrors ? property.errors : property.lastErrors;

    const errorToShow = showErrors ? errors[property.currentErrorIndex % errors.length] : undefined;

    const cycleError = showErrors ? () => property.currentErrorIndex++ : undefined;

    return (
        <div>
            <FormField
                isInvalid={!!errorToShow}
                isRequired={property.entry.definition.required}
                label={property.entry.definition.display_name}
                errorText={errorToShow}
                description={property.entry.definition.documentation}
                onClick={cycleError}
            >
                {input}
            </FormField>
        </div>
    );
});
