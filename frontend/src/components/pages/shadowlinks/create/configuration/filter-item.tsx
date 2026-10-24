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

const RESOURCE_TYPE_BY_PREFIX: Record<string, string> = {
  topics: 'topics',
  roles: 'roles',
  consumers: 'consumer groups',
};

const FILTER_TABS = {
  'include-specific': { patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE },
  'include-prefix': { patternType: PatternType.PREFIX, filterType: FilterType.INCLUDE },
  'exclude-specific': { patternType: PatternType.LITERAL, filterType: FilterType.EXCLUDE },
  'exclude-prefix': { patternType: PatternType.PREFIX, filterType: FilterType.EXCLUDE },
} as const;

type FilterTab = keyof typeof FILTER_TABS;

const isFilterTab = (value: string): value is FilterTab => value in FILTER_TABS;

const getFilterTab = (patternType: unknown, filterType: unknown): FilterTab =>
  (Object.keys(FILTER_TABS) as FilterTab[]).find(
    (tab) => FILTER_TABS[tab].patternType === patternType && FILTER_TABS[tab].filterType === filterType
  ) ?? 'include-specific';

const getFilterFieldNames = <TFieldValues extends FieldValues>(prefix: string, index: number) => ({
  pattern: `${prefix}.${index}.patternType` as FieldPath<TFieldValues>,
  filter: `${prefix}.${index}.filterType` as FieldPath<TFieldValues>,
  name: `${prefix}.${index}.name` as FieldPath<TFieldValues>,
});

const testIdFor = (dataTestId: string | undefined, suffix: string) =>
  dataTestId ? `${dataTestId}-${suffix}` : undefined;

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

type FilterItemSummaryProps = {
  filterLabel: string;
  nameValue: unknown;
  errorMessage?: string;
};

// Resume/summary view (non-editable)
const FilterItemSummary = ({ filterLabel, nameValue, errorMessage }: FilterItemSummaryProps) => (
  <div>
    <Item>
      <div className="text-body font-medium">{filterLabel}</div>
      <div className="flex flex-wrap gap-2">
        {nameValue ? (
          <Badge size="sm" tone="informative" variant="subtle">
            {String(nameValue)}
          </Badge>
        ) : (
          <Badge size="sm" tone="default" variant="subtle">
            (empty)
          </Badge>
        )}
      </div>
      {Boolean(errorMessage) && (
        <p className="mt-1 text-body text-destructive" data-slot="form-message">
          {errorMessage}
        </p>
      )}
    </Item>
  </div>
);

type FilterItemEditorProps = {
  tab: FilterTab;
  onTabChange: (tab: string) => void;
  onRemove: () => void;
  resourceType: string;
  showMatchAllMessage: boolean;
  dataTestId?: string;
  children: React.ReactNode;
};

const FilterItemEditor = ({
  tab,
  onTabChange,
  onRemove,
  resourceType,
  showMatchAllMessage,
  dataTestId,
  children,
}: FilterItemEditorProps) => (
  <FormItem className="flex-1" spacing="loose">
    <div className="flex items-center justify-between gap-4">
      <Tabs onValueChange={onTabChange} value={tab}>
        <TabsList data-testid={testIdFor(dataTestId, 'filter-type')}>
          <TabsTrigger data-testid={testIdFor(dataTestId, 'include-specific')} value="include-specific">
            Include specific {resourceType}
          </TabsTrigger>
          <TabsTrigger data-testid={testIdFor(dataTestId, 'include-prefix')} value="include-prefix">
            Include starting with
          </TabsTrigger>
          <TabsTrigger data-testid={testIdFor(dataTestId, 'exclude-specific')} value="exclude-specific">
            Exclude specific
          </TabsTrigger>
          <TabsTrigger data-testid={testIdFor(dataTestId, 'exclude-prefix')} value="exclude-prefix">
            Exclude starting with
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Button
        data-testid={testIdFor(dataTestId, 'delete')}
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
  const fieldNames = getFilterFieldNames<TFieldValues>(fieldNamePrefix, index);
  const patternValue = useWatch({ control, name: fieldNames.pattern });
  const filterValue = useWatch({ control, name: fieldNames.filter });
  const nameValue = useWatch({ control, name: fieldNames.name });
  const resourceType = RESOURCE_TYPE_BY_PREFIX[fieldNamePrefix] ?? 'consumer groups';

  if (!viewType) {
    return (
      <FilterItemSummary
        errorMessage={errorMessage}
        filterLabel={getFilterTypeLabel(patternValue, filterValue, resourceType)}
        nameValue={nameValue}
      />
    );
  }

  const showMatchAllMessage =
    patternValue === PatternType.LITERAL && filterValue === FilterType.INCLUDE && nameValue === '*';

  // Editable view (full form)
  return (
    <Card data-testid={dataTestId} size="full" variant="elevated">
      <CardContent>
        <FormField
          control={control}
          name={fieldNames.pattern}
          render={({ field: patternField }) => (
            <FormField
              control={control}
              name={fieldNames.filter}
              render={({ field: filterField }) => (
                <FilterItemEditor
                  dataTestId={dataTestId}
                  onRemove={onRemove}
                  onTabChange={(value) => {
                    if (isFilterTab(value)) {
                      patternField.onChange(FILTER_TABS[value].patternType);
                      filterField.onChange(FILTER_TABS[value].filterType);
                    }
                  }}
                  resourceType={resourceType}
                  showMatchAllMessage={showMatchAllMessage}
                  tab={getFilterTab(patternField.value, filterField.value)}
                >
                  {children}
                </FilterItemEditor>
              )}
            />
          )}
        />
      </CardContent>
    </Card>
  );
};
