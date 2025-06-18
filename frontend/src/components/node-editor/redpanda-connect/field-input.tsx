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
    const opts = spec.annotated_options?.map(([v]) => v) ?? spec.options;

    if (!opts) {
      return null;
    }

    return (
      <FormField
        control={control}
        name={path}
        render={({ field }) => (
          <FormItem className="space-y-1 my-2">
            <div className="flex flex-col gap-2">
              <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
              {spec.description && (
                <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                  {spec.description}
                </FormDescription>
              )}
            </div>
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
            <FormItem className="space-y-2 my-4">
              <div className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
                {spec.description && (
                  <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                    {spec.description}
                  </FormDescription>
                )}
              </div>
              <FormControl>
                <Input
                  type={spec.is_secret ? 'password' : 'text'}
                  placeholder={spec.default ? String(spec.default) : undefined}
                  {...field}
                />
              </FormControl>

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
            <FormItem className="space-y-1 my-2">
              <div className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
                {spec.description && (
                  <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                    {spec.description}
                  </FormDescription>
                )}
              </div>
              <FormControl>
                <Input
                  type="number"
                  step={spec.type === 'int' ? 1 : 'any'}
                  placeholder={spec.default !== undefined ? String(spec.default) : undefined}
                  {...field}
                />
              </FormControl>
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
            <FormItem className="flex flex-row items-start gap-3 rounded-md border p-4 space-y-1 my-2">
              <FormControl>
                <Checkbox checked={field.value ?? spec.default ?? false} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium leading-none">{spec.name}</FormLabel>
                {spec.description && (
                  <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                    {spec.description}
                  </FormDescription>
                )}
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
            <FormItem className="space-y-1 my-2">
              <div className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
                {spec.description && (
                  <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                    {spec.description}
                  </FormDescription>
                )}
              </div>
              <FormControl>
                <Textarea rows={3} placeholder={spec.default ? String(spec.default) : undefined} {...field} />
              </FormControl>
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
        <FormItem className="space-y-1 my-2">
          <div className="flex flex-col gap-2">
            <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
            {spec.description && (
              <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                {spec.description}
              </FormDescription>
            )}
          </div>
          <div className="space-y-3">
            {fields.length === 0 ? (
              <div className="text-xs text-muted-foreground italic p-3 border border-dashed rounded-md text-center">
                No items added yet
              </div>
            ) : (
              fields.map((field, idx) => (
                <div key={field.id} className="relative border rounded-lg p-4 bg-muted/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Item {idx + 1}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => remove(idx)}
                      className="h-7 px-2 text-xs"
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {childSpec ? (
                      <FieldInput
                        path={`${path}.${idx}`}
                        spec={{
                          ...childSpec,
                          name: childSpec.name || 'Value',
                        }}
                      />
                    ) : (
                      <FormField
                        control={control}
                        name={`${path}.${idx}`}
                        render={({ field: itemField }) => (
                          <FormItem className="space-y-1 my-2">
                            <FormLabel className="text-sm font-medium">Value</FormLabel>
                            <FormControl>
                              <Input placeholder={spec.default ? String(spec.default) : undefined} {...itemField} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
            <Button type="button" onClick={addItem} variant="outline" className="w-full">
              + Add Item
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
        <FormItem className="space-y-1 my-2">
          <div className="space-y-2">
            <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
            {spec.description && (
              <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                {spec.description}
              </FormDescription>
            )}
          </div>
          <div className="space-y-3">
            {fields.length === 0 ? (
              <div className="text-xs text-muted-foreground italic p-3 border border-dashed rounded-md text-center">
                No key-value pairs added yet
              </div>
            ) : (
              fields.map((field, idx) => (
                <div key={field.id} className="border rounded-lg p-4 bg-muted/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pair {idx + 1}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => remove(idx)}
                      className="h-7 px-2 text-xs"
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={control}
                      name={`${path}.${idx}.key`}
                      render={({ field: keyField }) => (
                        <FormItem className="space-y-1 my-2">
                          <FormLabel className="text-sm font-medium">Key</FormLabel>
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
                        <FormItem className="space-y-1 my-2">
                          <FormLabel className="text-sm font-medium">Value</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter value" {...valueField} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))
            )}
            <Button type="button" onClick={addKeyValuePair} variant="outline" className="w-full">
              + Add Key-Value Pair
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
        <FormItem className="space-y-1 my-2">
          <div className="space-y-2">
            <FormLabel className="text-sm font-medium">{spec.name}</FormLabel>
            {spec.description && (
              <FormDescription className="text-xs text-muted-foreground leading-relaxed">
                {spec.description}
              </FormDescription>
            )}
          </div>
          <div className="space-y-4">
            {rows.length === 0 ? (
              <div className="text-xs text-muted-foreground italic p-3 border border-dashed rounded-md text-center">
                No rows added yet
              </div>
            ) : (
              rows.map((row, rowIdx) => (
                <div key={row.id} className="border-2 border-dashed border-muted rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">Row {rowIdx + 1}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">2D Array</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeRow(rowIdx)}
                      className="h-7 px-2 text-xs"
                    >
                      Remove Row
                    </Button>
                  </div>
                  <div className="pl-4 border-l-2 border-muted">
                    <ArrayField
                      path={`${path}.${rowIdx}`}
                      spec={{
                        ...spec,
                        kind: 'array',
                        name: 'Items',
                        description: undefined, // Remove description to avoid repetition
                      }}
                    />
                  </div>
                </div>
              ))
            )}
            <Button type="button" onClick={addRow} variant="outline" className="w-full">
              + Add Row
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
