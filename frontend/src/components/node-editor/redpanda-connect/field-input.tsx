import type { FieldSpec } from '@/components/node-editor/redpanda-connect/types';
import { Button } from '@/components/redpanda-ui/button';
import { Checkbox } from '@/components/redpanda-ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/redpanda-ui/form';
import { Input } from '@/components/redpanda-ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/redpanda-ui/select';
import { Textarea } from '@/components/redpanda-ui/textarea';
import { useFieldArray, useFormContext } from 'react-hook-form';

type UiField = {
  path: string; // e.g. "http_server.address"
  spec: FieldSpec;
};

export const FieldInput: React.FC<UiField> = ({ path, spec }) => {
  switch (spec.kind) {
    case '2darray':
      return <TwoDArrayField path={path} spec={spec} />;
    case 'scalar':
      return <ScalarField path={path} spec={spec} />;
    case 'array':
      return <ArrayField path={path} spec={spec} />;
    case 'map':
      return <MapField path={path} spec={spec} />;
  }
};

const ScalarField: React.FC<UiField> = ({ path, spec }) => {
  const { control } = useFormContext();

  // Handle annotated options for any type - render as select.
  // According to Tyler they can only apply to string types at the moment,
  // but generic handling shouldn't hurt.
  if (spec.annotated_options || spec.options) {
    const opts = spec.annotated_options?.map(([v]) => v) ?? spec.options!;
    return (
      <FormField
        control={control}
        name={path}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{spec.name}</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value || spec.default}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={spec.default ? String(spec.default) : 'Select an option'} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {opts.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {spec.description && <FormDescription>{spec.description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  // Handle regular field types
  switch (spec.type) {
    case 'string':
      return (
        <FormField
          control={control}
          name={path}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{spec.name}</FormLabel>
              <FormControl>
                <Input
                  type={spec.is_secret ? 'password' : 'text'}
                  placeholder={spec.default ? String(spec.default) : undefined}
                  {...field}
                />
              </FormControl>
              {spec.description && <FormDescription>{spec.description}</FormDescription>}
              <FormMessage />
            </FormItem>
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
            <FormItem>
              <FormLabel>{spec.name}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step={spec.type === 'int' ? 1 : 'any'}
                  placeholder={spec.default !== undefined ? String(spec.default) : undefined}
                  {...field}
                />
              </FormControl>
              {spec.description && <FormDescription>{spec.description}</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
      );

    case 'bool':
      return (
        <FormField
          control={control}
          name={path}
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={field.value ?? spec.default ?? false} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="flex flex-col gap-1">
                <FormLabel className="leading-snug">{spec.name}</FormLabel>
                {spec.description && <FormDescription className="leading-snug">{spec.description}</FormDescription>}
              </div>
            </FormItem>
          )}
        />
      );

    // There are a bunch of other known types, but we want them to render as TextArea anyways.
    default:
      return (
        <FormField
          control={control}
          name={path}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{spec.name}</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder={spec.default ? String(spec.default) : undefined} {...field} />
              </FormControl>
              {spec.description && <FormDescription>{spec.description}</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
      );
  }
};

const ArrayField: React.FC<UiField> = ({ path, spec }) => {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: path });

  // Determine the child field spec for array elements
  const childSpec = spec.children?.[0];

  // Determine default value based on child type and spec defaults
  const getDefaultValue = () => {
    if (!childSpec) return '';

    // Use the spec's default if available
    if (childSpec.default !== undefined) {
      return childSpec.default;
    }

    // Fallback to type-based defaults
    switch (childSpec.kind) {
      case 'scalar':
        switch (childSpec.type) {
          case 'int':
          case 'float':
            return 0;
          case 'bool':
            return false;
          default:
            return '';
        }
      case 'array':
        return [];
      case 'map':
        return {};
      case '2darray':
        return [[]];
      default:
        return '';
    }
  };

  const addItem = () => {
    append(getDefaultValue());
  };

  return (
    <FormField
      control={control}
      name={path}
      render={() => (
        <FormItem className="flex flex-col gap-4">
          <div>
            <FormLabel className="text-base">{spec.name}</FormLabel>
            {spec.description && <FormDescription>{spec.description}</FormDescription>}
          </div>
          <div className="flex flex-col gap-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="flex gap-2 items-start p-3 border rounded-md">
                <div className="flex-1">
                  {childSpec ? (
                    // Use the appropriate field component based on child spec
                    <FieldInput
                      path={`${path}.${idx}`}
                      spec={{
                        ...childSpec,
                        name: `Item ${idx + 1}`,
                      }}
                    />
                  ) : (
                    // Fallback to simple input if no child spec
                    <FormField
                      control={control}
                      name={`${path}.${idx}`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          <FormLabel>Item {idx + 1}</FormLabel>
                          <FormControl>
                            <Input placeholder={spec.default ? String(spec.default) : undefined} {...itemField} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)} className="mt-6">
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" onClick={addItem} variant="outline">
              Add Item
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

const MapField: React.FC<UiField> = ({ path, spec }) => {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: path,
  });

  // For maps, we store an array of {key: string, value: any} objects
  const addKeyValuePair = () => {
    append({ key: '', value: '' });
  };

  return (
    <FormField
      control={control}
      name={path}
      render={() => (
        <FormItem className="flex flex-col gap-4">
          <div>
            <FormLabel className="text-base">{spec.name}</FormLabel>
            {spec.description && <FormDescription>{spec.description}</FormDescription>}
          </div>
          <div className="flex flex-col gap-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="flex gap-2 items-start p-3 border rounded-md">
                <div className="flex flex-col gap-2 flex-1">
                  <FormField
                    control={control}
                    name={`${path}.${idx}.key`}
                    render={({ field: keyField }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Key</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter key" {...keyField} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`${path}.${idx}.value`}
                    render={({ field: valueField }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Value</FormLabel>
                        <FormControl>
                          {/* For now, default to string input. TODO: make this dynamic based on spec.children */}
                          <Input placeholder={spec.default ? 'Enter value' : 'Enter value'} {...valueField} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="button" variant="destructive" size="sm" onClick={() => remove(idx)} className="mt-6">
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" onClick={addKeyValuePair} variant="outline">
              Add Key-Value Pair
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

const TwoDArrayField: React.FC<UiField> = ({ path, spec }) => {
  const { control } = useFormContext();
  const {
    fields: rows,
    append: appendRow,
    remove: removeRow,
  } = useFieldArray({
    control,
    name: path,
  });

  const addRow = () => {
    appendRow([]); // Add empty array for new row
  };

  return (
    <FormField
      control={control}
      name={path}
      render={() => (
        <FormItem className="flex flex-col gap-4">
          <div>
            <FormLabel className="text-base">{spec.name}</FormLabel>
            {spec.description && <FormDescription>{spec.description}</FormDescription>}
          </div>
          <div className="flex flex-col gap-3">
            {rows.map((row, rowIdx) => (
              <div key={row.id} className="p-3 border rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Row {rowIdx + 1}</span>
                  <Button type="button" variant="destructive" size="sm" onClick={() => removeRow(rowIdx)}>
                    Remove Row
                  </Button>
                </div>
                <ArrayField
                  path={`${path}.${rowIdx}`}
                  spec={{
                    ...spec,
                    kind: 'array', // Convert 2darray to regular array for each row
                    name: `Row ${rowIdx + 1}`,
                  }}
                />
              </div>
            ))}
            <Button type="button" onClick={addRow} variant="outline">
              Add Row
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
