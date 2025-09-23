/** biome-ignore-all lint/suspicious/noArrayIndexKey: part of DynamicJSONForm implementation */
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Input } from 'components/redpanda-ui/components/input';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
import { Braces, FileEdit, SpellCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { JsonEditor } from './json-editor';
import type { JsonSchemaType, JsonValue } from './json-utils';
import { updateValueAtPath } from './json-utils';

interface CustomFieldConfig {
  fieldName: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onCreateOption?: (newValue: string, path: string[], handleFieldChange: (path: string[], value: JsonValue) => void) => void;
}

interface DynamicJSONFormProps {
  schema: JsonSchemaType;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  maxDepth?: number;
  showPlaceholder?: boolean;
  customFields?: CustomFieldConfig[];
}

const isTypeSupported = (type: JsonSchemaType['type'], supportedTypes: string[]): boolean => {
  if (Array.isArray(type)) {
    return type.every((t) => supportedTypes.includes(t));
  }
  return typeof type === 'string' && supportedTypes.includes(type);
};

const isSimpleObject = (schema: JsonSchemaType): boolean => {
  const supportedTypes = ['string', 'number', 'integer', 'boolean', 'null'];
  if (schema.type && isTypeSupported(schema.type, supportedTypes)) return true;
  if (schema.type === 'object') {
    // Allow objects with properties (even nested ones) to be considered "simple" for form rendering
    return !!schema.properties && Object.keys(schema.properties).length > 0;
  }
  if (schema.type === 'array') {
    // Allow arrays with defined item schemas to be considered "simple"
    return !!schema.items;
  }
  return false;
};

const getArrayItemDefault = (schema: JsonSchemaType): JsonValue => {
  if ('default' in schema && schema.default !== undefined) {
    return schema.default;
  }

  switch (schema.type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    case 'null':
      return null;
    default:
      return null;
  }
};

const generateExampleData = (schema: JsonSchemaType): JsonValue => {
  if ('default' in schema && schema.default !== undefined) {
    return schema.default;
  }

  switch (schema.type) {
    case 'string':
      return (schema.examples?.[0] as string) || '';
    case 'number':
    case 'integer':
      return (schema.examples?.[0] as number) || 42;
    case 'boolean':
      return (schema.examples?.[0] as boolean) || true;
    case 'array':
      if (schema.items) {
        return [generateExampleData(schema.items as JsonSchemaType)];
      }
      return [];
    case 'object':
      if (schema.properties) {
        const result: Record<string, JsonValue> = {};
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          result[key] = generateExampleData(propSchema as JsonSchemaType);
        });
        return result;
      }
      return {};
    case 'null':
      return null;
    default:
      return null;
  }
};

const hasEmptyValues = (value: JsonValue, schema: JsonSchemaType): boolean => {
  if (!value) return true;

  if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, JsonValue>;
    if (Object.keys(obj).length === 0) return true;

    // Check if all values are empty/default
    if (schema.properties) {
      return Object.entries(schema.properties).every(([key, propSchema]) => {
        const val = obj[key];
        const subSchema = propSchema as JsonSchemaType;

        if (val === undefined || val === null) return true;
        if (subSchema.type === 'string' && val === '') return true;
        if ((subSchema.type === 'number' || subSchema.type === 'integer') && val === 0) return true;
        if (subSchema.type === 'boolean' && val === false) return true;
        if (subSchema.type === 'array' && Array.isArray(val) && val.length === 0) return true;
        if (subSchema.type === 'object' && hasEmptyValues(val, subSchema)) return true;

        return false;
      });
    }
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
};

export const DynamicJSONForm = ({
  schema,
  value,
  onChange,
  maxDepth = 3,
  showPlaceholder = true,
  customFields = [],
}: DynamicJSONFormProps) => {
  // Always allow switching between Form and JSON modes - Form is the default
  const isOnlyJSON = false;
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonError, setJsonError] = useState<string>();

  // Store the raw JSON string to allow immediate feedback during typing
  // while deferring parsing until the user stops typing
  const [rawJsonValue, setRawJsonValue] = useState<string>(() => {
    // Use example data when starting with empty values and showPlaceholder is true
    let initialValue: JsonValue;
    if (showPlaceholder && hasEmptyValues(value, schema)) {
      initialValue = generateExampleData(schema);
    } else {
      initialValue = value || (schema.type === 'array' ? [] : {});
    }
    return JSON.stringify(initialValue, null, 2);
  });

  // Use a ref to manage debouncing timeouts to avoid parsing JSON
  // on every keystroke which would be inefficient and error-prone
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce JSON parsing and parent updates to handle typing gracefully
  const debouncedUpdateParent = useCallback(
    (jsonString: string) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set a new timeout
      timeoutRef.current = setTimeout(() => {
        try {
          const parsed = JSON.parse(jsonString);
          onChange(parsed);
          setJsonError(undefined);
        } catch {
          // Don't set error during normal typing
        }
      }, 300);
    },
    [onChange],
  );

  // Update rawJsonValue when value prop changes
  useEffect(() => {
    // Use example data when the value is empty and showPlaceholder is true
    let displayValue: JsonValue;
    if (showPlaceholder && hasEmptyValues(value, schema)) {
      displayValue = generateExampleData(schema);
    } else {
      displayValue = value || (schema.type === 'array' ? [] : {});
    }
    setRawJsonValue(JSON.stringify(displayValue, null, 2));
  }, [value, schema, showPlaceholder]);

  const handleSwitchToFormMode = () => {
    if (isJsonMode) {
      // When switching to Form mode, ensure we have valid JSON
      try {
        const parsed = JSON.parse(rawJsonValue);
        // Update the parent component's state with the parsed value
        onChange(parsed);
        // Switch to form mode
        setIsJsonMode(false);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    } else {
      // When switching to JSON mode, generate example data if showPlaceholder is true and current value is empty
      let displayValue: JsonValue;
      if (showPlaceholder && hasEmptyValues(value, schema)) {
        displayValue = generateExampleData(schema);
      } else {
        displayValue = value || (schema.type === 'array' ? [] : {});
      }
      setRawJsonValue(JSON.stringify(displayValue, null, 2));
      setIsJsonMode(true);
    }
  };

  const formatJson = () => {
    try {
      const jsonStr = rawJsonValue.trim();
      if (!jsonStr) {
        return;
      }
      const formatted = JSON.stringify(JSON.parse(jsonStr), null, 2);
      setRawJsonValue(formatted);
      debouncedUpdateParent(formatted);
      setJsonError(undefined);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const renderFormFields = (
    propSchema: JsonSchemaType,
    currentValue: JsonValue,
    path: string[] = [],
    depth = 0,
    parentSchema?: JsonSchemaType,
    propertyName?: string,
  ) => {
    if (depth >= maxDepth && (propSchema.type === 'object' || propSchema.type === 'array')) {
      // Render as JSON editor when max depth is reached
      return (
        <JsonEditor
          value={JSON.stringify(currentValue ?? (propSchema.type === 'array' ? [] : {}), null, 2)}
          onChange={(newValue) => {
            try {
              const parsed = JSON.parse(newValue);
              handleFieldChange(path, parsed);
              setJsonError(undefined);
            } catch (err) {
              setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
            }
          }}
          error={jsonError}
        />
      );
    }

    // Check if this property is required in the parent schema
    const isRequired = parentSchema?.required?.includes(propertyName || '') ?? false;

    let fieldType = propSchema.type;
    if (Array.isArray(fieldType)) {
      // Of the possible types, find the first non-null type to determine the control to render
      fieldType = fieldType.find((t) => t !== 'null') ?? fieldType[0];
    }

    switch (fieldType) {
      case 'string': {
        // Check for custom field configuration
        const customFieldConfig = customFields.find((field) => field.fieldName === propertyName);
        if (customFieldConfig) {
          // Auto-select if there's only one option and no current value
          // Use the default value instead of triggering state updates during render
          const effectiveValue = (() => {
            if (customFieldConfig.options.length === 1 && !currentValue) {
              return customFieldConfig.options[0].value;
            }
            return currentValue as string;
          })();

          return (
            <Combobox
              options={customFieldConfig.options}
              value={effectiveValue ?? ''}
              onChange={(val) => {
                if (!val && !isRequired) {
                  handleFieldChange(path, undefined);
                } else {
                  handleFieldChange(path, val);
                }
              }}
              placeholder={customFieldConfig.placeholder || 'Select an option...'}
              creatable
              onCreateOption={(newValue) => {
                if (customFieldConfig.onCreateOption) {
                  customFieldConfig.onCreateOption(newValue, path, handleFieldChange);
                } else {
                  const newOption = { value: newValue, label: newValue };
                  customFieldConfig.options.push(newOption);
                  handleFieldChange(path, newValue);
                }
              }}
            />
          );
        }

        if (propSchema.oneOf?.every((option) => typeof option.const === 'string' && typeof option.title === 'string')) {
          const oneOfOptions: ComboboxOption[] = propSchema.oneOf.map((option) => ({
            value: option.const as string,
            label: option.title as string,
          }));
          
          return (
            <Combobox
              options={oneOfOptions}
              value={(currentValue as string) ?? ''}
              onChange={(val) => {
                if (!val && !isRequired) {
                  handleFieldChange(path, undefined);
                } else {
                  handleFieldChange(path, val);
                }
              }}
              placeholder="Select an option..."
              creatable
              onCreateOption={(newValue) => {
                const newOption = { value: newValue, label: newValue };
                oneOfOptions.push(newOption);
                handleFieldChange(path, newValue);
              }}
            />
          );
        }

        if (propSchema.enum) {
          const enumOptions: ComboboxOption[] = propSchema.enum.map((option) => ({
            value: option,
            label: option,
          }));
          
          return (
            <Combobox
              options={enumOptions}
              value={(currentValue as string) ?? ''}
              onChange={(val) => {
                if (!val && !isRequired) {
                  handleFieldChange(path, undefined);
                } else {
                  handleFieldChange(path, val);
                }
              }}
              placeholder="Select an option..."
              creatable
              onCreateOption={(newValue) => {
                const newOption = { value: newValue, label: newValue };
                enumOptions.push(newOption);
                handleFieldChange(path, newValue);
              }}
            />
          );
        }

        let inputType = 'text';
        switch (propSchema.format) {
          case 'email':
            inputType = 'email';
            break;
          case 'uri':
            inputType = 'url';
            break;
          case 'date':
            inputType = 'date';
            break;
          case 'date-time':
            inputType = 'datetime-local';
            break;
          default:
            inputType = 'text';
            break;
        }

        return (
          <Input
            type={inputType}
            value={(currentValue as string) ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              // Always allow setting string values, including empty strings
              handleFieldChange(path, val);
            }}
            placeholder={propSchema.description}
            required={isRequired}
            minLength={propSchema.minLength}
            maxLength={propSchema.maxLength}
            pattern={propSchema.pattern}
          />
        );
      }

      case 'number':
        return (
          <Input
            type="number"
            value={(currentValue as number)?.toString() ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val && !isRequired) {
                handleFieldChange(path, undefined);
              } else {
                const num = Number(val);
                if (!Number.isNaN(num)) {
                  handleFieldChange(path, num);
                }
              }
            }}
            placeholder={propSchema.description}
            required={isRequired}
            min={propSchema.minimum}
            max={propSchema.maximum}
          />
        );

      case 'integer':
        return (
          <Input
            type="number"
            step="1"
            value={(currentValue as number)?.toString() ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val && !isRequired) {
                handleFieldChange(path, undefined);
              } else {
                const num = Number(val);
                if (!Number.isNaN(num) && Number.isInteger(num)) {
                  handleFieldChange(path, num);
                }
              }
            }}
            placeholder={propSchema.description}
            required={isRequired}
            min={propSchema.minimum}
            max={propSchema.maximum}
          />
        );

      case 'boolean':
        return (
          <Input
            type="checkbox"
            checked={(currentValue as boolean) ?? false}
            onChange={(e) => handleFieldChange(path, e.target.checked)}
            className="w-4 h-4"
            required={isRequired}
          />
        );
      case 'null':
        return null;
      case 'object':
        if (!propSchema.properties) {
          return (
            <JsonEditor
              value={JSON.stringify(currentValue ?? {}, null, 2)}
              onChange={(newValue) => {
                try {
                  const parsed = JSON.parse(newValue);
                  handleFieldChange(path, parsed);
                  setJsonError(undefined);
                } catch (err) {
                  setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
                }
              }}
              error={jsonError}
            />
          );
        }

        return (
          <div className="space-y-2 p-3">
            {Object.entries(propSchema.properties).map(([key, subSchema]) => (
              <div key={key}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm font-medium">
                    {key}
                    {propSchema.required?.includes(key) && <span className="text-red-500 ml-1">*</span>}
                  </div>
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    {(subSchema as JsonSchemaType).type || 'unknown'}
                  </Badge>
                </div>
                {renderFormFields(
                  subSchema as JsonSchemaType,
                  (currentValue as Record<string, JsonValue>)?.[key],
                  [...path, key],
                  depth + 1,
                  propSchema,
                  key,
                )}
              </div>
            ))}
          </div>
        );
      case 'array': {
        let arrayValue = Array.isArray(currentValue) ? currentValue : [];
        if (!propSchema.items) return null;

        // Handle empty arrays without triggering state update during render
        if (arrayValue.length === 0) {
          const defaultValue = getArrayItemDefault(propSchema.items as JsonSchemaType);
          arrayValue = [defaultValue];
        }

        // If the array items are simple, render as form fields, otherwise use JSON editor
        if (isSimpleObject(propSchema.items)) {
          return (
            <div className="space-y-4">
              {propSchema.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{propSchema.description}</p>
              )}

              <div className="space-y-4">
                {arrayValue.map((item, index) => {
                  // Create a contextual name for the array item
                  const itemTypeName =
                    propSchema.items?.title ||
                    propSchema.items?.description ||
                    propertyName?.replace(/s$/, '') ||
                    'Item'; // Remove trailing 's' from property name
                  const itemDisplayName = itemTypeName.charAt(0).toUpperCase() + itemTypeName.slice(1);

                  return (
                    <div key={index} className="border border-border rounded-lg p-4 bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-foreground">
                          {itemDisplayName} #{index + 1}
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newArray = [...arrayValue];
                            newArray.splice(index, 1);
                            handleFieldChange(path, newArray);
                          }}
                          className={arrayValue.length <= 1 ? 'invisible' : ''}
                          disabled={arrayValue.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {propSchema.items?.type === 'object' && propSchema.items.properties
                          ? Object.entries(propSchema.items.properties).map(([key, subSchema]) => (
                              <div key={key} className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium text-foreground">{key}</div>
                                  <Badge variant="outline" className="text-xs px-1 py-0">
                                    {(subSchema as JsonSchemaType).type || 'unknown'}
                                  </Badge>
                                  {propSchema.items?.required?.includes(key) && (
                                    <span className="text-red-500 ml-1">*</span>
                                  )}
                                </div>
                                {renderFormFields(
                                  subSchema as JsonSchemaType,
                                  (item as Record<string, JsonValue>)?.[key],
                                  [...path, index.toString(), key],
                                  depth + 1,
                                  propSchema.items,
                                  key,
                                )}
                              </div>
                            ))
                          : renderFormFields(
                              propSchema.items as JsonSchemaType,
                              item,
                              [...path, index.toString()],
                              depth + 1,
                            )}
                      </div>
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const defaultValue = getArrayItemDefault(propSchema.items as JsonSchemaType);
                    handleFieldChange(path, [...arrayValue, defaultValue]);
                  }}
                  className="w-full border-dashed"
                >
                  + Add{' '}
                  {propSchema.items?.title ||
                    propSchema.items?.description ||
                    propertyName?.replace(/s$/, '') ||
                    'Item'}
                </Button>
              </div>
            </div>
          );
        }

        // For complex arrays, fall back to JSON editor
        return (
          <JsonEditor
            value={JSON.stringify(currentValue ?? [], null, 2)}
            onChange={(newValue) => {
              try {
                const parsed = JSON.parse(newValue);
                handleFieldChange(path, parsed);
                setJsonError(undefined);
              } catch (err) {
                setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
              }
            }}
            error={jsonError}
          />
        );
      }
      default:
        return null;
    }
  };

  const handleFieldChange = (path: string[], fieldValue: JsonValue) => {
    if (path.length === 0) {
      onChange(fieldValue);
      return;
    }

    try {
      const newValue = updateValueAtPath(value, path, fieldValue);
      onChange(newValue);
    } catch (error) {
      console.error('Failed to update form value:', error);
      onChange(value);
    }
  };

  const shouldUseJsonMode =
    schema.type === 'object' && (!schema.properties || Object.keys(schema.properties).length === 0);

  useEffect(() => {
    if (shouldUseJsonMode && !isJsonMode) {
      setIsJsonMode(true);
    }
  }, [shouldUseJsonMode, isJsonMode]);

  // Handle initialization of empty arrays with default values
  useEffect(() => {
    const initializeArrayDefaults = (currentSchema: JsonSchemaType, currentValue: JsonValue, path: string[] = []) => {
      if (currentSchema.type === 'array' && currentSchema.items) {
        const arrayValue = Array.isArray(currentValue) ? currentValue : [];
        if (arrayValue.length === 0) {
          const defaultValue = getArrayItemDefault(currentSchema.items as JsonSchemaType);
          const newValue = updateValueAtPath(value, path, [defaultValue]);
          onChange(newValue);
        }
      } else if (currentSchema.type === 'object' && currentSchema.properties) {
        Object.entries(currentSchema.properties).forEach(([key, subSchema]) => {
          const subValue = (currentValue as Record<string, JsonValue>)?.[key];
          initializeArrayDefaults(subSchema as JsonSchemaType, subValue, [...path, key]);
        });
      }
    };

    // Only initialize if we have a value and are not in JSON mode
    if (value !== undefined && !isJsonMode) {
      initializeArrayDefaults(schema, value);
    }
  }, [schema, value, onChange, isJsonMode]);

  // Handle auto-selection for custom fields with single options
  // biome-ignore lint/correctness/useExhaustiveDependencies: part of DynamicJSONForm implementation
  useEffect(() => {
    const syncAutoSelections = (currentSchema: JsonSchemaType, currentValue: JsonValue, path: string[] = []) => {
      if (currentSchema.type === 'object' && currentSchema.properties) {
        Object.entries(currentSchema.properties).forEach(([key, subSchema]) => {
          const subValue = (currentValue as Record<string, JsonValue>)?.[key];
          const customFieldConfig = customFields.find((field) => field.fieldName === key);

          if (customFieldConfig && customFieldConfig.options.length === 1 && !subValue) {
            const autoSelectedValue = customFieldConfig.options[0].value;
            handleFieldChange([...path, key], autoSelectedValue);
          }

          syncAutoSelections(subSchema as JsonSchemaType, subValue, [...path, key]);
        });
      }
    };

    if (value !== undefined && !isJsonMode && customFields.length > 0) {
      syncAutoSelections(schema, value);
    }
  }, [schema, value, customFields, isJsonMode]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end space-x-2">
        {isJsonMode && (
          <>
            <CopyButton
              variant="outline"
              size="sm"
              content={JSON.stringify(value, null, 2)}
              onCopy={() =>
                toast.success('JSON copied', {
                  description: 'The JSON data has been successfully copied to your clipboard.',
                })
              }
            >
              Copy JSON
            </CopyButton>
            <Button type="button" variant="outline" size="sm" onClick={formatJson}>
              <SpellCheck className="h-4 w-4 mr-2" />
              Format JSON
            </Button>
          </>
        )}

        {!isOnlyJSON && (
          <Button variant="outline" size="sm" onClick={handleSwitchToFormMode}>
            {isJsonMode ? (
              <>
                <FileEdit className="h-4 w-4 mr-2" />
                Switch to Form
              </>
            ) : (
              <>
                <Braces className="h-4 w-4 mr-2" />
                Switch to JSON
              </>
            )}
          </Button>
        )}
      </div>

      {isJsonMode ? (
        <JsonEditor
          value={rawJsonValue}
          onChange={(newValue) => {
            // Always update local state
            setRawJsonValue(newValue);

            // Use the debounced function to attempt parsing and updating parent
            debouncedUpdateParent(newValue);
          }}
          error={jsonError}
        />
      ) : (
        renderFormFields(schema, value)
      )}
    </div>
  );
};
