import { FormControl, FormErrorMessage, FormHelperText, Input, Checkbox } from '@redpanda-data/ui';
import { observer, useLocalObservable } from 'mobx-react';
import { PropsWithoutRef } from 'react';
import { Property } from '../../../../../state/connect/state';

export const TopicInput = observer(({ properties }: PropsWithoutRef<{ properties: Property[] }>) => {
    const state = useLocalObservable(() => {
        const props = new Map(properties.map((p) => [p.name, p]));
        const topicsRegex = properties.find(x => x.name == 'topics.regex');
        const initialSelection = topicsRegex?.value ? 'topics.regex' : 'topics';
        return {
            properties: props,
            _selected: initialSelection,
            get property() {
                return this.properties.get(this._selected)!;
            },
            setSelectedProp(input: string) {
                this.property.value = '';
                this._selected = input;
            },
        };
    });

    if (!state.property) return null;

    const showErrors = state.property.errors.length > 0;
    const errors = showErrors ? state.property.errors : state.property.lastErrors;
    const errorToShow = showErrors ? errors[state.property.currentErrorIndex % errors.length] : undefined;
    const cycleError = showErrors ? () => state.property.currentErrorIndex++ : undefined;

    return (
        <FormControl>
            {state.properties.has('topics.regex') && (
                <Checkbox
                    isChecked={state._selected == 'topics.regex'}
                    onChange={(e) => state.setSelectedProp(e.target.checked ? 'topics.regex' : 'topics')}>
                    Use regular expresions
                </Checkbox>
            )}

            <FormHelperText mb={15}>{state.property.entry.definition.documentation}</FormHelperText>

            <Input value={String(state.property.value)} onChange={(e) => (state.property.value = e.target.value)} spellCheck={false} />

            {showErrors && <FormErrorMessage onClick={cycleError}>{errorToShow}</FormErrorMessage>}
        </FormControl>
    );
});
