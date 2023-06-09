import { Select as RPSelect } from '@redpanda-data/ui';
import { SelectProps as RPSelectProps, isSingleValue } from '@redpanda-data/ui/dist/components/Inputs/Select/Select';


type SingleSelectProps<T> = Omit<RPSelectProps<T>, 'value' | 'onChange'> & {
    value: T;
    onChange: (e: T) => void;
};

export function SingleSelect<T>(p: SingleSelectProps<T>) {

    return <RPSelect<T>
        options={p.options}
        value={{ value: p.value }}
        onChange={e => {
            if (!e)
                return;

            if (isSingleValue(e)) {
                p.onChange(e.value);
            }
        }}
    />

}
