import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Choicebox, ChoiceboxItem, ChoiceboxItemIndicator } from 'components/redpanda-ui/components/choicebox';
import { Form, FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleMultiSelect } from 'components/redpanda-ui/components/multi-select';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { SearchIcon } from 'lucide-react';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type {
  ConnectComponentType,
  ConnectTilesFormData,
  ExtendedConnectComponentSpec,
  FormSubmitResult,
} from './types';
import { CONNECT_COMPONENT_TYPE, connectTilesFormSchema } from './types';
import {
  getCategoryConfig,
  getComponentByCompositeValue,
  getComponentTypeConfig,
  getNodeCategories,
  getStatusConfig,
  parseConnectionValue,
  searchComponents,
} from './utils';

export interface ConnectTilesRef {
  triggerSubmit: () => Promise<FormSubmitResult>;
  isLoading: boolean;
}

export const ConnectTiles = forwardRef<
  ConnectTilesRef,
  {
    additionalComponents?: ExtendedConnectComponentSpec[];
    componentTypeFilter?: ConnectComponentType;
    onChange?: (compositeValue: string, componentType: ConnectComponentType) => void;
    hideHeader?: boolean;
    defaultCompositeValue?: string;
    gridCols?: number;
  }
>(
  (
    {
      additionalComponents,
      componentTypeFilter: defaultComponentTypeFilter,
      onChange,
      hideHeader,
      defaultCompositeValue,
      gridCols = 4,
    },
    ref,
  ) => {
    const [filter, setFilter] = useState<string>('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    // Default to showing all component types if no default provided, otherwise respect the prop
    const [componentTypeFilter, setComponentTypeFilter] = useState<ConnectComponentType[]>(
      defaultComponentTypeFilter ? [defaultComponentTypeFilter] : [],
    );

    const form = useForm<ConnectTilesFormData>({
      resolver: zodResolver(connectTilesFormSchema),
      mode: 'onChange',
      defaultValues: {
        connectionName: defaultCompositeValue || '',
      },
    });

    const categories = getNodeCategories(additionalComponents);

    // Form submission handler
    const handleSubmit = (data: ConnectTilesFormData): FormSubmitResult => {
      try {
        // Parse the composite connection value to get type and name
        const { type, name } = parseConnectionValue(data.connectionName);
        
        if (!type || !name) {
          return {
            success: false,
            message: 'Invalid connection selection',
            error: 'Could not parse connection type and name',
          };
        }

        // Get the actual component spec to ensure we have the correct type
        const componentSpec = getComponentByCompositeValue(data.connectionName, additionalComponents);
        
        if (!componentSpec) {
          return {
            success: false,
            message: 'Component not found',
            error: `Could not find component: ${type}-${name}`,
          };
        }

        return {
          success: true,
          message: `Connected to ${name} (${type}) successfully!`,
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
              <div className="grid grid-cols-3 gap-2">
                <Label className="flex-1">
                  Search for Connectors
                  <Input
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                    }}
                    placeholder="Snowflake, S3..."
                    className="flex-1"
                  >
                    <InputStart>
                      <SearchIcon className="size-4" />
                    </InputStart>
                  </Input>
                </Label>

                <Label className="flex-1">
                  Component Type
                  <SimpleMultiSelect
                    options={CONNECT_COMPONENT_TYPE.map((type) => {
                      const { text, icon, variant } = getComponentTypeConfig(type);
                      return {
                        value: type,
                        label: (
                          <Badge icon={icon} variant={variant}>
                            {text}
                          </Badge>
                        ),
                      };
                    })}
                    value={componentTypeFilter}
                    onValueChange={setComponentTypeFilter}
                    placeholder="Input, Output..."
                    maxDisplay={2}
                    width="full"
                  />
                </Label>

                <Label className="flex-1">
                  Categories
                  <SimpleMultiSelect
                    options={categories.map((category) => {
                      const { icon, text, variant } = getCategoryConfig(category.id);
                      return {
                        value: category.id,
                        label: (
                          <Badge icon={icon} variant={variant}>
                            {text}
                          </Badge>
                        ),
                      };
                    })}
                    value={selectedCategories}
                    onValueChange={setSelectedCategories}
                    placeholder="Databases, Social..."
                    maxDisplay={3}
                    width="full"
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
                    {filteredComponents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Text className="text-muted-foreground">No connections found matching your filters</Text>
                        <Text className="text-sm text-muted-foreground mt-1">
                          Try adjusting your search, component type, or category filters
                        </Text>
                      </div>
                    ) : (
                      <Choicebox>
                        <div className={cn('grid gap-2', `grid-cols-${gridCols}`)}>
                          {filteredComponents.map((component) => {
                            const statusConfig = getStatusConfig(component.status);
                            const uniqueKey = `${component.type}-${component.name}-${component.status}`;

                            return (
                              <ChoiceboxItem
                                value={`${component.type}-${component.name}`}
                                checked={field.value === `${component.type}-${component.name}`}
                                key={uniqueKey}
                                onClick={() => {
                                  const compositeValue = `${component.type}-${component.name}`;
                                  field.onChange(compositeValue);
                                  onChange?.(compositeValue, component.type as ConnectComponentType);
                                }}
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <Text className="truncate font-medium">{component.name}</Text>
                                    {field.value === `${component.type}-${component.name}` && <ChoiceboxItemIndicator />}
                                  </div>
                                  {/* Component Summary */}
                                  {component.summary && (
                                    <Text className="text-sm text-muted-foreground line-clamp-2">
                                      {component.summary}
                                    </Text>
                                  )}
                                  <div className="flex gap-1 flex-wrap">
                                    {/* Component type badge */}
                                    <Badge
                                      icon={getComponentTypeConfig(component.type).icon}
                                      variant={getComponentTypeConfig(component.type).variant}
                                    >
                                      {getComponentTypeConfig(component.type).text}
                                    </Badge>
                                    {/* Category badges */}
                                    {component.categories?.filter(Boolean).map((c) => {
                                      const { icon, text, variant } = getCategoryConfig(c);
                                      return (
                                        <Badge icon={icon} variant={variant} key={`${c}-${text}`}>
                                          {text}
                                        </Badge>
                                      );
                                    })}
                                    {/* Status badge for non-stable components */}
                                    {component.status !== 'stable' && (
                                      <Badge icon={statusConfig.icon} variant={statusConfig.variant}>
                                        {statusConfig.text}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </ChoiceboxItem>
                            );
                          })}
                        </div>
                      </Choicebox>
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        </CardContent>
      </Card>
    );
  },
);

ConnectTiles.displayName = 'AddDataStep';
