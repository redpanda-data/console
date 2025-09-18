import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Choicebox, ChoiceboxItem, ChoiceboxItemIndicator } from 'components/redpanda-ui/components/choicebox';
import { Form, FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleMultiSelect } from 'components/redpanda-ui/components/multi-select';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import { SearchIcon } from 'lucide-react';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useConnectConfig } from '../../../../state/onboarding-wizard/state';
import type { StepSubmissionResult } from '../types';
import type { ConnectComponentType, ExtendedConnectComponentSpec } from '../types/connect';
import { CONNECT_COMPONENT_TYPE } from '../types/connect';
import { type AddDataFormData, addDataFormSchema } from '../types/forms';
import {
  getCategoryConfig,
  getComponentTypeConfig,
  getNodeCategories,
  getStatusConfig,
  searchComponents,
} from '../utils/connect';

export interface AddDataStepRef {
  triggerSubmit: () => Promise<StepSubmissionResult>;
  isLoading: boolean;
}

export const AddDataStep = forwardRef<
  AddDataStepRef,
  {
    additionalComponents?: ExtendedConnectComponentSpec[];
    componentTypeFilter?: ConnectComponentType;
    onChange?: (connectionName: string, componentType: ConnectComponentType) => void;
    hideHeader?: boolean;
  }
>(({ additionalComponents, componentTypeFilter: defaultComponentTypeFilter, onChange, hideHeader }, ref) => {
  const [filter, setFilter] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Default to showing all component types if no default provided, otherwise respect the prop
  const [componentTypeFilter, setComponentTypeFilter] = useState<ConnectComponentType[]>(
    defaultComponentTypeFilter ? [defaultComponentTypeFilter] : [],
  );
  const { data: persistedConnectConfig, setData: setConnectConfig } = useConnectConfig();
  const categories = getNodeCategories(additionalComponents);

  const form = useForm<AddDataFormData>({
    resolver: zodResolver(addDataFormSchema),
    mode: 'onChange',
    defaultValues: {
      connectionName: persistedConnectConfig?.connectionName,
    },
  });

  // Form submission handler
  const handleSubmit = (data: AddDataFormData): StepSubmissionResult => {
    try {
      setConnectConfig({
        connectionName: data.connectionName,
      });

      return {
        success: true,
        message: `Connected to ${data.connectionName} successfully!`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save connection data',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  // Expose methods to parent wizard
  useImperativeHandle(ref, () => ({
    triggerSubmit: async () => {
      const isValid = await form.trigger();
      if (isValid) {
        const data = form.getValues();
        return handleSubmit(data);
      }
      return {
        success: false,
        message: 'Please fix the form errors before proceeding',
        error: 'Form validation failed',
      };
    },
    isLoading: false, // No async operations with localStorage
  }));

  // Filter components based on search, categories, and component type
  const filteredComponents = useMemo(() => {
    return searchComponents(
      filter,
      {
        types: componentTypeFilter,
        categories: selectedCategories,
      },
      additionalComponents,
    );
  }, [componentTypeFilter, filter, selectedCategories, additionalComponents]);

  return (
    <Card size="full">
      {!hideHeader && (
        <CardHeader className="mb-4">
          <CardTitle>
            <Heading level={2}>Select a connector</Heading>
          </CardTitle>
          <CardDescription>
            Redpanda Connect is an alternative to Kafka Connect. It allows you to connect to a variety of data sources
            and sinks, and to create pipelines to transform data.{' '}
            <Link href="https://docs.redpanda.com/redpanda-cloud/develop/connect/about/" target="_blank">
              Learn more.
            </Link>
          </CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <Form {...form}>
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap gap-4">
              <Label>
                Search connectors
                <Input
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                  }}
                  placeholder="Search by name or description"
                  className="w-[230px]"
                >
                  <InputStart>
                    <SearchIcon className="size-4" />
                  </InputStart>
                </Input>
              </Label>

              <Label>
                Component Type
                <SimpleMultiSelect
                  options={CONNECT_COMPONENT_TYPE.map((type) => ({
                    value: type,
                    label: getComponentTypeConfig(type).text,
                  }))}
                  value={componentTypeFilter}
                  onValueChange={setComponentTypeFilter}
                  placeholder="Select component types"
                  maxDisplay={2}
                  width="md"
                />
              </Label>

              <Label>
                Categories
                <SimpleMultiSelect
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  value={selectedCategories}
                  onValueChange={setSelectedCategories}
                  placeholder="Filter by category"
                  maxDisplay={3}
                  width="md"
                />
              </Label>
            </div>
          </div>

          <FormField
            control={form.control}
            name="connectionName"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Choicebox>
                    <div className="grid grid-cols-4 gap-2">
                      {filteredComponents.map((component) => {
                        const categoryConfig = getCategoryConfig(component.categories);
                        const statusConfig = getStatusConfig(component.status);
                        const uniqueKey = `${component.type}-${component.name}-${component.status}`;

                        return (
                          <ChoiceboxItem
                            value={component.name}
                            key={uniqueKey}
                            onClick={() => {
                              field.onChange(component.name);
                              onChange?.(component.name, component.type as ConnectComponentType);
                            }}
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Text className="truncate font-medium">{component.name}</Text>
                                {field.value === component.name && <ChoiceboxItemIndicator />}
                              </div>
                              {/* Component Summary */}
                              {component.summary && (
                                <Text className="text-sm text-muted-foreground line-clamp-2">{component.summary}</Text>
                              )}
                              <div className="flex gap-1 flex-wrap">
                                {/* Component type badge */}
                                <Badge
                                  className={`flex items-center gap-1 text-xs ${
                                    getComponentTypeConfig(component.type).className
                                  }`}
                                >
                                  {getComponentTypeConfig(component.type).icon}
                                  <span className="leading-none">
                                    {component.type.charAt(0).toUpperCase() + component.type.slice(1)}
                                  </span>
                                </Badge>
                                {/* Category badges */}
                                {categoryConfig?.map((c) => (
                                  <Badge className={`flex items-center gap-1 ${c.className} text-xs`} key={c.text}>
                                    {c.icon}
                                    <span className="leading-none">{c.text}</span>
                                  </Badge>
                                ))}
                                {/* Status badge for non-stable components */}
                                {component.status !== 'stable' && (
                                  <Badge className={`flex items-center gap-1 ${statusConfig.className} text-xs`}>
                                    {statusConfig.icon}
                                    <span className="leading-none">{statusConfig.text}</span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </ChoiceboxItem>
                        );
                      })}
                      {filteredComponents.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          {componentTypeFilter.length === 0 ? (
                            <>
                              <Text className="text-muted-foreground">Select a component type to view connections</Text>
                              <Text className="text-sm text-muted-foreground mt-1">
                                Choose component types from the filters above
                              </Text>
                            </>
                          ) : (
                            <>
                              <Text className="text-muted-foreground">No connections found matching your filters</Text>
                              <Text className="text-sm text-muted-foreground mt-1">
                                Try adjusting your search, component type, or category filters
                              </Text>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </Choicebox>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Form>
      </CardContent>
    </Card>
  );
});

AddDataStep.displayName = 'AddDataStep';
