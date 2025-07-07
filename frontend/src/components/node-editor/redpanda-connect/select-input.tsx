import { ControllerRenderProps } from 'react-hook-form';
import type { FieldSpec } from '@/components/node-editor/redpanda-connect/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/redpanda-ui/select';

type SelectInputProps = {
  field: ControllerRenderProps<any, any>;
  spec: FieldSpec;
};

export const SelectInput: React.FC<SelectInputProps> = ({ field, spec }) => {
  // `annotated_options` is an array of [value, description] tuples. We just need the value.
  // We coalesce to `options` if the first one is not present.
  const opts = spec.annotated_options?.map(([v]) => v) ?? spec.options;

  if (!opts) {
    // This case should ideally not be reached if FieldRenderer is correct, but it's a safe fallback.
    return null;
  }

  return (
    <Select onValueChange={field.onChange} value={field.value ?? spec.default ?? ''}>
      <SelectTrigger>
        <SelectValue placeholder={spec.default ? String(spec.default) : 'Select an option'} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((optionValue) => (
          <SelectItem key={optionValue} value={optionValue}>
            {optionValue}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
