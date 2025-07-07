import { useFieldArray, useFormContext } from 'react-hook-form';
import { FieldRenderer } from './field-renderer';
import { buildObjectItem, generateDefaultValue, isComponentType, isPrimitiveScalar, wrapIfPrimitive } from './utils';
import { Button } from '@/components/redpanda-ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/redpanda-ui/card';
import { FieldSpec } from './types';

export const ArrayInput: React.FC<{ path: string; spec: FieldSpec }> = ({ path, spec }) => {
  const { control } = useFormContext();
  const { fields, append, remove, move } = useFieldArray({ control, name: path });


  const childSpec = spec.children?.[0];

  if (!childSpec) return null; // Can't render an array without knowing the child type

  /** Array where each element is a fixed-shape object described by `children`. */
  const isArrayOfFixedObjects = spec.type === 'object' || Boolean(spec.children?.length);

  /** Array where each element is a Benthos component configuration (`input`, `processor`, …). */
  const isComponentArray = isComponentType(spec.type);

  /** Array of plain primitives (string/int/…) that we must wrap for RHF. */
  const isPrimitiveArray = !isArrayOfFixedObjects && !isComponentArray && isPrimitiveScalar(childSpec);

  /** Create the right default element for `append`. */
  const makeDefaultItem = () => {
    if (isArrayOfFixedObjects) {
      return buildObjectItem(spec.children!);
    }
    if (isComponentArray) {
      return {}; // empty component placeholder
    }
    return wrapIfPrimitive(generateDefaultValue(childSpec));
  };


  const addItem = () => append(makeDefaultItem());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{spec.name}</CardTitle>
        {spec.description && (
          <CardDescription>{spec.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center border border-dashed rounded-md p-4">
            No items added yet
          </p>
        )}

        {fields.map((field, index) => {
          const basePath = isPrimitiveArray
            ? `${path}.${index}.value`
            : `${path}.${index}`;

          return (
            <div
              key={field.id ?? index}
              className="relative rounded-lg border bg-muted/20 p-4 space-y-3"
            >
              {/* --- Order & Delete buttons --------------------------------------------- */}
              <div className="absolute top-2 right-2 flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className="h-6 w-6"
                >
                  ↑
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="h-6 w-6"
                >
                  ↓
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={() => remove(index)}
                  className="h-6 w-6"
                >
                  ✕
                </Button>
              </div>

              {/* --- Item content --------------------------------------------- */}
              {isArrayOfFixedObjects ? (
                /* known children: render each property */
                spec.children!.map((propSpec) => (
                  <FieldRenderer
                    key={propSpec.name}
                    path={`${basePath}.${propSpec.name}`}
                    spec={propSpec}
                  />
                ))
              ) : (
                /* primitive or component configuration */
                <FieldRenderer path={basePath} spec={childSpec} />
              )}
            </div>
          );
        })}

        <Button type="button" onClick={addItem} variant="outline" className="w-full">
          + Add Item
        </Button>
      </CardContent>
    </Card>
  );
};