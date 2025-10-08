import { isSingleSelectOptions, isSingleValue, Select as RPSelect } from '@redpanda-data/ui';
import type { SelectProps } from '@redpanda-data/ui/dist/components/Inputs/Select/Select';

export type SingleSelectProps<T> = Omit<SelectProps<T>, 'value' | 'onChange'> & {
  value: T;
  onChange: (e: T) => void;
  chakraStyles?: SelectProps<T>['chakraStyles'];
};

export function SingleSelect<T>(p: SingleSelectProps<T>) {
  const options = p.options;

  return (
    <RPSelect<T>
      {...p}
      formatOptionLabel={(data) => {
        // Bug: data.label has the same value as data.value instead of the proper label
        // so we must find the actual option again based on the value
        if (isSingleSelectOptions(options)) {
          const entry = options.first((x) => x.value === data.value);
          return entry?.label ?? data.label ?? String(data.value);
        }

        return data.label ?? String(data.value);
      }}
      onChange={(e) => {
        if (!e) {
          return;
        }

        if (isSingleValue(e)) {
          p.onChange(e.value);
        }
      }}
      options={p.options}
      value={{ value: p.value }}
    />
  );
}
