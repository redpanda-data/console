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
  /** Lands on the Select trigger (not the creatable input), so a `<label htmlFor>` can point at it. */
  id?: string;
  className?: string;
  'data-testid'?: string;
} & ({ creatable?: false; onCreate?: never } | { creatable: true; onCreate: (value: string) => T });

export function SingleSelect<T>(p: SingleSelectProps<T>) {
  const { 'data-testid': testId, options, value, onChange, isDisabled, placeholder, id, className } = p;
  // The Registry controls key on strings; values round-trip through `byKey`.
  const items = options.map((option) => ({
    value: String(option.value),
    label: option.label ?? String(option.value),
    disabled: option.disabled,
  }));
  const byKey = new Map(options.map((option) => [String(option.value), option]));
  const selectedKey = value === undefined || value === null ? null : String(value);

  const selectElement =
    p.creatable === true ? (
      <Combobox
        className="w-full"
        creatable
        disabled={isDisabled}
        // Clearing the field clears the value, so what is shown is what applies.
        onChange={(key) => {
          const option = byKey.get(key);
          onChange(option ? option.value : p.onCreate(key));
        }}
        options={items}
        placeholder={placeholder}
        value={selectedKey ?? ''}
      />
    ) : (
      <Select
        disabled={isDisabled}
        items={items}
        onValueChange={(key: unknown) => {
          const option = typeof key === 'string' ? byKey.get(key) : undefined;
          if (option) {
            onChange(option.value);
          }
        }}
        // A value outside `options` still shows as text, as the old select did.
        value={selectedKey}
      >
        <SelectTrigger className="w-full" id={id}>
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

  return (
    <div className={className} data-testid={testId}>
      {selectElement}
    </div>
  );
}
