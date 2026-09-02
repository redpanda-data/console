import { Combobox } from 'components/redpanda-ui/components/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import type { ReactNode } from 'react';

export type SingleSelectOption<T> = { value: T; label?: ReactNode; disabled?: boolean };

export type SingleSelectProps<T> = {
  options: SingleSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  isDisabled?: boolean;
  placeholder?: string;
  /** Lets the user type a value that is not in `options`; only meaningful when T is string. */
  creatable?: boolean;
  /** Lands on the trigger, so a `<label htmlFor>` can point at it. */
  id?: string;
  className?: string;
  'data-testid'?: string;
};

const labelOf = <T,>(option: SingleSelectOption<T>) => option.label ?? String(option.value);
const textOf = <T,>(option: SingleSelectOption<T>) =>
  typeof option.label === 'string' ? option.label : String(option.value);

export function SingleSelect<T>(p: SingleSelectProps<T>) {
  const { 'data-testid': testId, options, value, onChange, isDisabled, placeholder, creatable, id, className } = p;
  // The Registry select keys on strings; values round-trip through `key`.
  const items = options.map((option) => ({ key: String(option.value), option }));
  const byKey = new Map(items.map((item) => [item.key, item.option]));
  const selectedKey = value === undefined || value === null ? null : String(value);

  const selectElement = creatable ? (
    <Combobox
      className={className}
      clearable={false}
      creatable
      disabled={isDisabled}
      onChange={(key) => {
        // The old select could not be cleared; keep that so toggling or blurring never empties the value.
        if (key !== '') {
          onChange((byKey.get(key)?.value ?? key) as T);
        }
      }}
      options={items.map(({ key, option }) => ({ value: key, label: textOf(option), disabled: option.disabled }))}
      placeholder={placeholder}
      value={selectedKey ?? ''}
    />
  ) : (
    <Select
      disabled={isDisabled}
      items={items.map(({ key, option }) => ({ value: key, label: labelOf(option) }))}
      onValueChange={(key) => {
        const option = byKey.get(key);
        if (option) {
          onChange(option.value);
        }
      }}
      value={selectedKey !== null && byKey.has(selectedKey) ? selectedKey : null}
    >
      <SelectTrigger className={className} id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map(({ key, option }) => (
          <SelectItem disabled={option.disabled} key={key} value={key}>
            {labelOf(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // Wrap in div with data-testid if provided, for E2E testing
  if (testId) {
    return <div data-testid={testId}>{selectElement}</div>;
  }

  return selectElement;
}
