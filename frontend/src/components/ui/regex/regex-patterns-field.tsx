/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

type RegexPatternsFieldProps = {
  patterns: string[];
  onChange: (patterns: string[]) => void;
  isReadOnly?: boolean;
  label?: string;
  helperText?: string;
};

// Validate regex pattern
const validateRegex = (pattern: string): { valid: boolean; error?: string } => {
  if (!pattern) {
    return { valid: true };
  }
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
};

export const RegexPatternsField = ({
  patterns,
  onChange,
  isReadOnly = false,
  label = 'Regex Patterns',
  helperText = 'Add regex patterns to match multiple topics (e.g., my-topic-prefix-.*)',
}: RegexPatternsFieldProps) => {
  const [validationStates, setValidationStates] = useState<Record<number, { valid: boolean; error?: string }>>({});

  const handlePatternChange = (index: number, value: string) => {
    const newPatterns = [...patterns];
    newPatterns[index] = value;
    onChange(newPatterns);

    // Update validation state
    const validation = validateRegex(value);
    setValidationStates({ ...validationStates, [index]: validation });
  };

  const handleAddPattern = () => {
    onChange([...patterns, '']);
  };

  const handleRemovePattern = (index: number) => {
    const newPatterns = patterns.filter((_, i) => i !== index);
    onChange(newPatterns);

    // Clean up validation state
    const newValidationStates = { ...validationStates };
    delete newValidationStates[index];
    setValidationStates(newValidationStates);
  };

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      <Text className="text-muted-foreground text-sm">{helperText}</Text>

      {patterns.map((pattern, idx) => {
        const validation = validationStates[idx] || validateRegex(pattern);
        let inputClassName = '';
        if (pattern) {
          inputClassName = validation.valid ? 'pr-10' : 'border-destructive pr-10';
        }

        return (
          <div className="flex items-start gap-2" key={idx}>
            <div className="mb-0 flex-1">
              <div className="relative">
                <Input
                  className={inputClassName}
                  disabled={isReadOnly}
                  onChange={(e) => handlePatternChange(idx, e.target.value)}
                  placeholder="e.g., my-topics-.*"
                  value={pattern}
                />
                {pattern && !isReadOnly && (
                  <div className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3">
                    {validation.valid ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                )}
              </div>
              {!validation.valid && pattern && (
                <Text className="mt-1 text-destructive text-xs">{validation.error}</Text>
              )}
            </div>

            {!isReadOnly && (
              <Button onClick={() => handleRemovePattern(idx)} size="icon" type="button" variant="outline">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}

      {!isReadOnly && (
        <Button className="w-full" onClick={handleAddPattern} type="button" variant="dashed">
          <Plus className="h-4 w-4" /> Add Regex Pattern
        </Button>
      )}
    </div>
  );
};
