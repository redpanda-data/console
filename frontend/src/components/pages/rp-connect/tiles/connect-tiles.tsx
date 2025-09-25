import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from 'components/redpanda-ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardSize,
  CardTitle,
  CardVariant,
} from 'components/redpanda-ui/components/card';
import { Choicebox, ChoiceboxItem, ChoiceboxItemIndicator } from 'components/redpanda-ui/components/choicebox';
import { Form, FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input, InputStart } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleMultiSelect } from 'components/redpanda-ui/components/multi-select';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ConnectComponentType, ConnectTilesFormData, ExtendedConnectComponentSpec } from './types';
import { CONNECT_COMPONENT_TYPE, connectTilesFormSchema } from './types';
import {
  getCategoryConfig,
  getComponentTypeConfig,
  getNodeCategories,
  getStatusConfig,
  searchComponents,
} from './utils';

export const ConnectTiles = ({
  additionalComponents,
  componentTypeFilter: defaultComponentTypeFilter,
  onChange,
  hideHeader,
  hideFilters,
  defaultConnectionName,
  defaultConnectionType,
  gridCols = 4,
  variant = 'default',
  size = 'full',
}: {
  additionalComponents?: ExtendedConnectComponentSpec[];
  componentTypeFilter?: ConnectComponentType[];
  onChange?: (connectionName: string, connectionType: ConnectComponentType) => void;
  hideHeader?: boolean;
  hideFilters?: boolean;
  defaultConnectionName?: string;
  defaultConnectionType?: ConnectComponentType;
  gridCols?: number;
  variant?: CardVariant;
  size?: CardSize;
}) => {
  const [filter, setFilter] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Default to showing all component types if no default provided, otherwise respect the prop
  const [componentTypeFilter, setComponentTypeFilter] = useState<ConnectComponentType[]>(
    defaultComponentTypeFilter ? defaultComponentTypeFilter : [],
  );

  const form = useForm<ConnectTilesFormData>({
    resolver: zodResolver(connectTilesFormSchema),
    mode: 'onChange',
    defaultValues: {
      connectionName: defaultConnectionName || '',
      connectionType: defaultConnectionType,
    },
  });

  const categories = getNodeCategories(additionalComponents);

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
    <Card size={size} variant={variant}>
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
      <CardContent className="relative">
        <Form {...form}>
          {!hideFilters && (
            <div className="flex flex-col gap-4 sticky top-0 bg-background z-10 border-b-2 pb-6 mb-0">
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
          )}

          <div className="max-h-96 overflow-y-auto py-4">
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
                                value={component.name}
                                checked={
                                  field.value === component.name && form.getValues('connectionType') === component.type
                                }
                                key={uniqueKey}
                                onClick={() => {
                                  field.onChange(component.name);
                                  form.setValue('connectionType', component.type);
                                  onChange?.(component.name, component.type as ConnectComponentType);
                                }}
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <Text className="truncate font-medium">{component.name}</Text>
                                    {field.value === component.name &&
                                      form.getValues('connectionType') === component.type && <ChoiceboxItemIndicator />}
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
          </div>
        </Form>
      </CardContent>
    </Card>
  );
};
