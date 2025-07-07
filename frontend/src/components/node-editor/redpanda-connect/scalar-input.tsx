import { useFormContext } from 'react-hook-form';
import type { FieldSpec } from './types';
import { Checkbox } from '@/components/redpanda-ui/checkbox';
import { Input } from '@/components/redpanda-ui/input';
import { Textarea } from '@/components/redpanda-ui/textarea';
import { FormField } from '@/components/redpanda-ui/form';
import { FormFieldWrapper } from './form-field-wrapper';
import { SelectInput } from './select-input';
import { ObjectInput } from './object-input';

type ScalarInputProps = {
  path: string;
  spec: FieldSpec;
};

export const ScalarInput: React.FC<ScalarInputProps> = ({ path, spec }) => {
  const { control } = useFormContext();

  // 1. Check for enums, handle as select / dropdown
  if (spec.options || spec.annotated_options) {
    return (
      <FormField
        control={control}
        name={path}
        render={({ field }) => (
          <FormFieldWrapper spec={spec}>
            <SelectInput field={field} spec={spec} />
          </FormFieldWrapper>
        )}
      />
    );
  }

  // 2. Handle all the other inputs
  switch (spec.type) {
    case 'string':
      return (
        <FormField
          control={control}
          name={path}
          render={({ field }) => (
            <FormFieldWrapper spec={spec}>
              <Input
                type={spec.is_secret ? 'password' : 'text'}
                placeholder={spec.default ? String(spec.default) : undefined}
                {...field}
              />
            </FormFieldWrapper>
          )}
        />
      );

    case 'int':
    case 'float':
      return (
        <FormField
          control={control}
          name={path}
          render={({ field }) => (
            <FormFieldWrapper spec={spec}>
              <Input
                type="number"
                step={spec.type === 'int' ? 1 : 'any'}
                placeholder={spec.default !== undefined ? String(spec.default) : undefined}
                {...field}
                // RHF might pass a string, so we ensure the value is a number for the input
                onChange={(e) => {
                  const num = spec.type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                  field.onChange(isNaN(num) ? '' : num);
                }}
              />
            </FormFieldWrapper>
          )}
        />
      );

    case 'bool':
      return (
        <FormField
          control={control}
          name={path}
          render={({ field }) => (
            <FormFieldWrapper spec={spec}>
              <Checkbox
                checked={field.value ?? spec.default ?? false}
                onCheckedChange={field.onChange}
                id={field.name}
              />
            </FormFieldWrapper>
          )}
        />
      );
    
    case 'object':
      // This handles nested object structures
      return <ObjectInput path={path} spec={spec} />;

    default:
      return (
        <FormField
          control={control}
          name={path}
          render={({ field }) => (
            <FormFieldWrapper spec={spec}>
              <Textarea rows={3} placeholder={spec.default ? String(spec.default) : undefined} {...field} />
            </FormFieldWrapper>
          )}
        />
      );
  }
};
