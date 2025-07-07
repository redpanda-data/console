import { useFormContext, useWatch } from 'react-hook-form';
import { FieldRenderer } from './field-renderer';
import { useState } from 'react';
import { Input } from '@/components/redpanda-ui/input';
import { Button } from '@/components/redpanda-ui/button';
import { FieldSpec } from './types';
import { generateDefaultValue } from './utils';
import { FormFieldWrapper } from './form-field-wrapper';

export const MapInput: React.FC<{ path: string; spec: FieldSpec }> = ({ path, spec }) => {
  const { control, setValue, unregister } = useFormContext();
  const [newKey, setNewKey] = useState('');
  
  // Watch the current value of the map to get its keys
  const mapData = useWatch({ control, name: path }) || {};
  const existingKeys = Object.keys(mapData);

  // The 'value' part of a map has a consistent spec
  const valueSpec = spec.children?.[0];
  if (!valueSpec) return null; // Map values must have a defined type

  const addPair = () => {
    if (newKey && !existingKeys.includes(newKey)) {
      // Set the value for the new key using react-hook-form
      setValue(`${path}.${newKey}`, generateDefaultValue(valueSpec), { shouldValidate: true });
      setNewKey('');
    }
  };

  const removePair = (keyToRemove: string) => {
    // To remove a key from an object in react-hook-form, you unregister it.
    unregister(`${path}.${keyToRemove}`);
  };

  return (
    <FormFieldWrapper spec={spec}>
      <div className="space-y-3">
        {existingKeys.map((key) => (
          <div key={key} className="border rounded-lg p-4 bg-muted/20 relative">
             <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => removePair(key)}
                className="absolute top-2 right-2 h-6 px-2 text-xs"
              >
                Remove
              </Button>
            {/* Recursively render the form for the VALUE of the map item */}
            <FieldRenderer
              path={`${path}.${key}`}
              spec={{ ...valueSpec, name: key }} // Use the key as the field name
            />
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2">
          <Input
            placeholder="Enter new key..."
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <Button type="button" onClick={addPair} variant="outline">
            + Add
          </Button>
        </div>
      </div>
    </FormFieldWrapper>
  );
};