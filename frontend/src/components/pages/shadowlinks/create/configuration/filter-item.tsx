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

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Info, Trash } from 'lucide-react';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useWatch } from 'react-hook-form';

import { Item } from '../../../../redpanda-ui/components/item';
import { getFilterTypeLabel } from '../../shadowlink-helpers';

type FilterItemProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  index: number;
  fieldNamePrefix: string;
  onRemove: () => void;
  children: React.ReactNode;
  viewType: boolean; // true = editable, false = resume/summary
  'data-testid'?: string;
  errorMessage?: string; // Error message to display in resume/summary view
};

export const FilterItem = <TFieldValues extends FieldValues>({
  control,
  index,
  fieldNamePrefix,
  onRemove,
  children,
  viewType,
  'data-testid': dataTestId,
  errorMessage,
}: FilterItemProps<TFieldValues>) => {
  const patternFieldName = `${fieldNamePrefix}.${index}.patternType` as FieldPath<TFieldValues>;
  const filterFieldName = `${fieldNamePrefix}.${index}.filterType` as FieldPath<TFieldValues>;
  const nameFieldName = `${fieldNamePrefix}.${index}.name` as FieldPath<TFieldValues>;

  const patternValue = useWatch({ control, name: patternFieldName });
  const filterValue = useWatch({ control, name: filterFieldName });
  const nameValue = useWatch({ control, name: nameFieldName });

  const showMatchAllMessage =
    patternValue === PatternType.LITERAL && filterValue === FilterType.INCLUDE && nameValue === '*';

  const resourceType = fieldNamePrefix === 'topics' ? 'topics' : 'consumer groups';

  // Resume/summary view (non-editable)
  if (!viewType) {
    const filterLabel = getFilterTypeLabel(patternValue, filterValue);

    return (
      <div>
        <Item>
          <div className="font-medium text-sm">{filterLabel}</div>
          <div className="flex flex-wrap gap-2">
            {nameValue ? (
              <Badge size="sm" variant="blue">
                {nameValue}
              </Badge>
            ) : (
              <Badge size="sm" variant="gray">
                (empty)
              </Badge>
            )}
          </div>
          {Boolean(errorMessage) && (
            <p className="mt-1 text-destructive text-sm" data-slot="form-message">
              {errorMessage}
            </p>
          )}
        </Item>
      </div>
    );
  }

  // Editable view (full form)
  return (
    <Card className="gap-0" data-testid={dataTestId} size="full" variant="elevated">
      <CardContent>
        <FormField
          control={control}
          name={patternFieldName}
          render={({ field: patternField }) => (
            <FormField
              control={control}
              name={filterFieldName}
              render={({ field: filterField }) => {
                const getTabValue = () => {
                  if (patternField.value === PatternType.LITERAL && filterField.value === FilterType.INCLUDE) {
                    return 'include-specific';
                  }
                  if (patternField.value === PatternType.PREFIX && filterField.value === FilterType.INCLUDE) {
                    return 'include-prefix';
                  }
                  if (patternField.value === PatternType.LITERAL && filterField.value === FilterType.EXCLUDE) {
                    return 'exclude-specific';
                  }
                  if (patternField.value === PatternType.PREFIX && filterField.value === FilterType.EXCLUDE) {
                    return 'exclude-prefix';
                  }
                  return 'include-specific';
                };

                const handleTabChange = (value: string) => {
                  switch (value) {
                    case 'include-specific':
                      patternField.onChange(PatternType.LITERAL);
                      filterField.onChange(FilterType.INCLUDE);
                      break;
                    case 'include-prefix':
                      patternField.onChange(PatternType.PREFIX);
                      filterField.onChange(FilterType.INCLUDE);
                      break;
                    case 'exclude-specific':
                      patternField.onChange(PatternType.LITERAL);
                      filterField.onChange(FilterType.EXCLUDE);
                      break;
                    case 'exclude-prefix':
                      patternField.onChange(PatternType.PREFIX);
                      filterField.onChange(FilterType.EXCLUDE);
                      break;
                    default:
                      break;
                  }
                };

                return (
                  <FormItem className="flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <Tabs onValueChange={handleTabChange} value={getTabValue()}>
                        <TabsList data-testid={dataTestId ? `${dataTestId}-filter-type` : undefined}>
                          <TabsTrigger
                            data-testid={dataTestId ? `${dataTestId}-include-specific` : undefined}
                            value="include-specific"
                          >
                            Include specific topics
                          </TabsTrigger>
                          <TabsTrigger
                            data-testid={dataTestId ? `${dataTestId}-include-prefix` : undefined}
                            value="include-prefix"
                          >
                            Include starting with
                          </TabsTrigger>
                          <TabsTrigger
                            data-testid={dataTestId ? `${dataTestId}-exclude-specific` : undefined}
                            value="exclude-specific"
                          >
                            Exclude specific
                          </TabsTrigger>
                          <TabsTrigger
                            data-testid={dataTestId ? `${dataTestId}-exclude-prefix` : undefined}
                            value="exclude-prefix"
                          >
                            Exclude starting with
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <Button
                        data-testid={dataTestId ? `${dataTestId}-delete` : undefined}
                        onClick={onRemove}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash className="h-3 w-3" />
                      </Button>
                    </div>
                    {children}
                    <FormMessage />
                    {Boolean(showMatchAllMessage) && (
                      <Alert variant="warning">
                        <Info className="h-4 w-4" />
                        <AlertDescription>This filter will match all {resourceType}.</AlertDescription>
                      </Alert>
                    )}
                  </FormItem>
                );
              }}
            />
          )}
        />
      </CardContent>
    </Card>
  );
};
