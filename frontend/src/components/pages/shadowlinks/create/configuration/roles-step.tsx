/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { ChevronDown } from 'lucide-react';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useState } from 'react';
import { type Control, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useSupportedFeaturesStore } from 'state/supported-features';

import { FilterItem } from './filter-item';
import type { FormValues } from '../model';

const RoleFilterNameInput = ({ control, index }: { control: Control<FormValues>; index: number }) => {
  const patternType = useWatch({ control, name: `roles.${index}.patternType` });

  return (
    <FormField
      control={control}
      name={`roles.${index}.name`}
      render={({ field: nameField }) => (
        <FormItem className="flex-1">
          <FormControl>
            <Input
              placeholder={patternType === PatternType.PREFIX ? 'prefix-' : 'my-role'}
              testId={`role-filter-${index}-name`}
              {...nameField}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export const RolesStep = () => {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<FormValues>();
  const [isOpen, setIsOpen] = useState(false);

  const rolesMode = useWatch({ control, name: 'rolesMode' });
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'roles',
  });
  const roleSyncSupported = useSupportedFeaturesStore((s) => s.shadowLinkRoleSync);

  const handleModeChange = (mode: string) => {
    setValue('rolesMode', mode as 'all' | 'specify');

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

  if (!roleSyncSupported) {
    return null;
  }

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <Card className="gap-0" size="full">
        <CardHeader>
          <CardTitle>Shadow roles</CardTitle>
          <CardAction>
            <CollapsibleTrigger
              render={
                <Button
                  aria-label="Toggle shadow roles section"
                  className="w-fit p-0"
                  data-testid="roles-toggle-button"
                  size="sm"
                  variant="ghost"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </Button>
              }
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Tabs onValueChange={handleModeChange} value={rolesMode}>
            <TabsList>
              <TabsTrigger data-testid="roles-all-tab" value="all">
                All roles
              </TabsTrigger>
              <TabsTrigger data-testid="roles-specify-tab" value="specify">
                Specify roles
              </TabsTrigger>
            </TabsList>

            {/* Resume/summary view when collapsed */}
            {!isOpen && rolesMode === 'specify' && fields.length > 0 && (
              <div className="mt-4 space-y-2">
                {fields.map((field, index) => {
                  const fieldError = errors.roles?.[index];
                  const errorMessage = fieldError?.name?.message;
                  return (
                    <FilterItem
                      control={control}
                      errorMessage={errorMessage}
                      fieldNamePrefix="roles"
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
                    All roles from the source cluster will be synchronized to the destination cluster.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="specify">
                <div className="space-y-4" data-testid="roles-filters-container">
                  {fields.map((field, index) => (
                    <FilterItem
                      control={control}
                      data-testid={`role-filter-${index}`}
                      fieldNamePrefix="roles"
                      index={index}
                      key={field.id}
                      onRemove={() => remove(index)}
                      viewType={true}
                    >
                      <RoleFilterNameInput control={control} index={index} />
                    </FilterItem>
                  ))}

                  <Button
                    data-testid="add-role-filter-button"
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
      </Card>
    </Collapsible>
  );
};
