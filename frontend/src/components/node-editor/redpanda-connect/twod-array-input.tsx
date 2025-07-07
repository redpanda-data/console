import { useFieldArray, useFormContext } from 'react-hook-form';
import type { FieldSpec } from '@/components/node-editor/redpanda-connect/types';
import { FormFieldWrapper } from './form-field-wrapper';
import { Button } from '@/components/redpanda-ui/button';
import { ArrayInput } from './array-input';

type TwoDArrayInputProps = {
  path: string;
  spec: FieldSpec;
};

export const TwoDArrayInput: React.FC<TwoDArrayInputProps> = ({ path, spec }) => {
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
    appendRow([]); // A new row in a 2D array is an empty array
  };

  return (
    <FormFieldWrapper spec={spec}>
      <div className="space-y-4">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground italic p-3 border border-dashed rounded-md text-center">
            No rows added yet
          </div>
        ) : (
          rows.map((row, rowIdx) => (
            <div key={row.id} className="border-2 border-dashed border-muted rounded-lg p-4 bg-background">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-foreground">
                  Row {rowIdx + 1}
                </span>
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
                {/* 
                  Here we compose the ArrayInput to render the inner array.
                  We transform the spec for the 2D array into a spec for a 1D array.
                */}
                <ArrayInput
                  path={`${path}.${rowIdx}`}
                  spec={{
                    ...spec,
                    kind: 'array', // We tell the child it's a 1D array
                    name: 'Items', // Give it a generic name
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
    </FormFieldWrapper>
  );
};
