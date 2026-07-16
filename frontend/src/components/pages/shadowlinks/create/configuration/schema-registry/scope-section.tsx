/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { TagChipInput } from './tag-chip-input';
import type { FormValues } from '../../model';

const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-mono">{children}</span>;

export const ScopeSection = () => {
  const { control, setValue, trigger } = useFormContext<FormValues>();
  const scopeMode = useWatch({ control, name: 'schemaRegistry.scopeMode' });
  const destinationContextsMode = useWatch({ control, name: 'schemaRegistry.destinationContextsMode' });
  const { fields, append, remove } = useFieldArray({ control, name: 'schemaRegistry.contextMappings' });

  const handleScopeModeChange = (mode: string) => {
    setValue('schemaRegistry.scopeMode', mode as 'all' | 'specify', { shouldValidate: true });
  };

  const handleDestinationModeChange = (mode: string) => {
    setValue('schemaRegistry.destinationContextsMode', mode as 'preserve' | 'map', { shouldValidate: true });

    // Keep any rows the user entered when toggling to preserve; the request
    // builder ignores them unless mode is map.
    if (mode === 'map' && fields.length === 0) {
      append({ source: '', destination: '' });
    }
  };

  // The "at least one context or subject" error is anchored to contexts, so
  // revalidate it when either changes.
  const revalidateScope = () => {
    trigger('schemaRegistry.contexts');
  };

  return (
    <div className="space-y-4" data-testid="sr-scope-section">
      <div className="text-label">Scope</div>

      <Tabs onValueChange={handleScopeModeChange} value={scopeMode}>
        <TabsList>
          <TabsTrigger testId="sr-scope-all-tab" value="all">
            Entire Schema Registry
          </TabsTrigger>
          <TabsTrigger testId="sr-scope-specify-tab" value="specify">
            Specify contexts and subjects
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {scopeMode === 'specify' && (
        <div className="flex flex-col gap-4" data-testid="sr-scope-specify-fields">
          <FormField
            control={control}
            name="schemaRegistry.contexts"
            render={({ field }) => (
              <FormItem data-testid="sr-contexts-field">
                <FormLabel>Contexts</FormLabel>
                <FormControl>
                  <TagChipInput
                    mono
                    onChange={(next) => {
                      field.onChange(next);
                      revalidateScope();
                    }}
                    placeholder="Type a context and press Enter"
                    testId="sr-contexts-input"
                    value={field.value}
                  />
                </FormControl>
                <FormDescription>
                  Source contexts to replicate in full. For example <Mono>.</Mono>, <Mono>.prod</Mono>, or{' '}
                  <Mono>.staging</Mono>.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="schemaRegistry.subjects"
            render={({ field }) => (
              <FormItem data-testid="sr-subjects-field">
                <FormLabel>Subjects</FormLabel>
                <FormControl>
                  <TagChipInput
                    mono
                    onChange={(next) => {
                      field.onChange(next);
                      revalidateScope();
                    }}
                    placeholder="Type a subject and press Enter"
                    testId="sr-subjects-input"
                    value={field.value}
                  />
                </FormControl>
                <FormDescription>
                  Exact subjects in qualified syntax. <Mono>orders-value</Mono> selects the subject in the default
                  context; <Mono>:.prod:orders-value</Mono> selects it in context <Mono>.prod</Mono>. If both contexts
                  and subjects are set, the union of both selections is replicated.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      <FormField
        control={control}
        name="schemaRegistry.destinationContextsMode"
        render={({ field }) => (
          <FormItem data-testid="sr-destination-contexts-field">
            <FormLabel>Destination contexts</FormLabel>
            <FormControl>
              <RadioGroup
                className="flex flex-col gap-3"
                onValueChange={handleDestinationModeChange}
                testId="sr-destination-mode-selection"
                value={field.value}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem id="sr-dest-preserve" testId="sr-dest-preserve-radio" value="preserve" />
                  <div className="flex flex-col gap-1.5">
                    <Label className="cursor-pointer font-medium" htmlFor="sr-dest-preserve">
                      Preserve source context names
                    </Label>
                    <div className="text-body text-muted-foreground">
                      Schemas land in the same context they came from.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem id="sr-dest-map" testId="sr-dest-map-radio" value="map" />
                  <div className="flex flex-col gap-1.5">
                    <Label className="cursor-pointer font-medium" htmlFor="sr-dest-map">
                      Map source contexts to explicit destination contexts
                    </Label>
                    <div className="text-body text-muted-foreground">
                      Every source context in scope must map to a distinct destination context to avoid collisions.
                    </div>
                  </div>
                </div>
              </RadioGroup>
            </FormControl>
          </FormItem>
        )}
      />

      {destinationContextsMode === 'map' && (
        <div className="flex flex-col gap-2 pl-7" data-testid="sr-context-mappings">
          {fields.map((row, index) => (
            <div className="flex items-start gap-2" key={row.id}>
              <FormField
                control={control}
                name={`schemaRegistry.contextMappings.${index}.source`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        {...field}
                        className="font-mono"
                        placeholder=".prod"
                        testId={`sr-mapping-${index}-source`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <span className="mt-2 text-muted-foreground text-sm">→</span>
              <FormField
                control={control}
                name={`schemaRegistry.contextMappings.${index}.destination`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        {...field}
                        className="font-mono"
                        placeholder=".dr"
                        testId={`sr-mapping-${index}-destination`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {fields.length > 1 ? (
                <Button
                  aria-label="Remove mapping"
                  data-testid={`sr-mapping-${index}-remove`}
                  onClick={() => remove(index)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              ) : (
                <span className="w-8 shrink-0" />
              )}
            </div>
          ))}
          <div>
            <Button
              data-testid="sr-add-mapping-button"
              onClick={() => append({ source: '', destination: '' })}
              size="sm"
              type="button"
              variant="outline"
            >
              Add mapping
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
