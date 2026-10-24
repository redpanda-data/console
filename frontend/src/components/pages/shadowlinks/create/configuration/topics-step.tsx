/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { CardContent, CardTitle } from 'components/redpanda-ui/components/card';
import { CollapsibleContent } from 'components/redpanda-ui/components/collapsible';
import { FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { FilterItem } from './filter-item';
import { CollapsibleSectionCard } from '../collapsible-section-card';
import type { FormValues } from '../model';

export const TopicsStep = () => {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<FormValues>();
  const [isOpen, setIsOpen] = useState(false);

  const topicsMode = useWatch({ control, name: 'topicsMode' });
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'topics',
  });

  const handleModeChange = (mode: string) => {
    setValue('topicsMode', mode as 'all' | 'specify');

    // Auto-expand when switching to specify mode
    if (mode === 'specify') {
      setIsOpen(true);
    }

    if (mode === 'specify' && fields.length === 0) {
      // Add an empty filter when switching to specify mode
      append({
        name: '',
        patternType: PatternType.LITERAL,
        filterType: FilterType.INCLUDE,
      });
    }

    if (mode === 'all') {
      replace([]);
    }
  };

  return (
    <CollapsibleSectionCard
      heading={<CardTitle>Shadow topics</CardTitle>}
      onOpenChange={setIsOpen}
      open={isOpen}
      toggleLabel="Toggle topics section"
      toggleTestId="topics-toggle-button"
    >
      <CardContent>
        <Tabs onValueChange={handleModeChange} value={topicsMode}>
          <TabsList>
            <TabsTrigger data-testid="topics-all-tab" value="all">
              All topics
            </TabsTrigger>
            <TabsTrigger data-testid="topics-specify-tab" value="specify">
              Specify topics
            </TabsTrigger>
          </TabsList>

          {/* Resume/summary view when collapsed */}
          {!isOpen && topicsMode === 'specify' && fields.length > 0 && (
            <div className="mt-4 space-y-2">
              {fields.map((field, index) => {
                const fieldError = errors.topics?.[index];
                const errorMessage = fieldError?.name?.message;
                return (
                  <FilterItem
                    control={control}
                    errorMessage={errorMessage}
                    fieldNamePrefix="topics"
                    index={index}
                    key={field.id}
                    onRemove={() => remove(index)}
                    viewType={false}
                  >
                    {null}
                  </FilterItem>
                );
              })}
            </div>
          )}

          {/* Full editable view when expanded */}
          <CollapsibleContent>
            <TabsContent value="all">
              <Alert>
                <AlertDescription>
                  All topics from the source cluster will be shadowed to the destination cluster.
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="specify">
              <div className="space-y-4" data-testid="topics-filters-container">
                {fields.map((field, index) => (
                  <FilterItem
                    control={control}
                    data-testid={`topic-filter-${index}`}
                    fieldNamePrefix="topics"
                    index={index}
                    key={field.id}
                    onRemove={() => remove(index)}
                    viewType={true}
                  >
                    <FormField
                      control={control}
                      name={`topics.${index}.name`}
                      render={({ field: nameField }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="* or metrics" testId={`topic-filter-${index}-name`} {...nameField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FilterItem>
                ))}

                <Button
                  data-testid="add-topic-filter-button"
                  onClick={() =>
                    append({
                      name: '',
                      patternType: PatternType.LITERAL,
                      filterType: FilterType.INCLUDE,
                    })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Add filter
                </Button>
              </div>
            </TabsContent>
          </CollapsibleContent>
        </Tabs>
      </CardContent>
    </CollapsibleSectionCard>
  );
};
