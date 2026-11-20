import { useFieldArray, useFormContext } from 'react-hook-form';

/**
 * RHF's collection view: only the schema-identified array path is accessed
 * through this context, never the form's unrelated scalar fields. Validate its
 * runtime value before RHF can discard an incompatible value as an empty array.
 */
export function useFormCollection(path: string) {
  const form = useFormContext<Record<string, unknown[]>>();
  const value: unknown = form.getValues(path);
  if (value !== undefined && !Array.isArray(value)) {
    throw new TypeError(`Expected an array form value at "${path}".`);
  }
  return useFieldArray({ control: form.control, name: path });
}
