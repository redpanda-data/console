import { Combobox } from 'components/redpanda-ui/components/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';

export type SingleSelectOption<T> = { value: T; label?: string; disabled?: boolean };

export type SingleSelectProps<T> = {
  options: SingleSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  isDisabled?: boolean;
  placeholder?: string;
  /** Lets the user type a value that is not in `options`; only meaningful when T is string. */
  creatable?: boolean;
  /** Lands on the Select trigger (not the creatable input), so a `<label htmlFor>` can point at it. */
  id?: string;
  className?: string;
  'data-testid'?: string;
};

export function SingleSelect<T>(p: SingleSelectProps<T>) {
  const { 'data-testid': testId, options, value, onChange, isDisabled, placeholder, creatable, id, className } = p;
  // The Registry controls key on strings; values round-trip through `byKey`.
  const items = options.map((option) => ({
    value: String(option.value),
    label: option.label ?? String(option.value),
    disabled: option.disabled,
  }));
  const byKey = new Map(options.map((option) => [String(option.value), option.value]));
  const selectedKey = value === undefined || value === null ? null : String(value);

  const selectElement = creatable ? (
    <Combobox
      className={className}
      creatable
      disabled={isDisabled}
      // Clearing the field clears the value, so what is shown is what applies.
      onChange={(key) => onChange((byKey.has(key) ? byKey.get(key) : key) as T)}
      options={items}
      placeholder={placeholder}
      value={selectedKey ?? ''}
    />
  ) : (
    <Select
      disabled={isDisabled}
      items={items}
      onValueChange={(key) => {
        if (byKey.has(key)) {
          onChange(byKey.get(key) as T);
        }
      }}
      // A value outside `options` still shows as text, as the old select did.
      value={selectedKey}
    >
      <SelectTrigger className={className} id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem disabled={item.disabled} key={item.value} value={item.value}>
            {item.label}
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
