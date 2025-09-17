import { Label } from 'components/redpanda-ui/components/label';
import { cn } from 'components/redpanda-ui/lib/utils';
import { useBooleanFlagValue } from 'custom-feature-flag-provider';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  Cpu,
  Database,
  FolderInput,
  FolderOutput,
  HelpCircle,
  Layers,
  Search,
  Timer,
  XCircle,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Badge } from '../../redpanda-ui/components/badge';
import { Button } from '../../redpanda-ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../../redpanda-ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from '../../redpanda-ui/components/popover';
import type { ComponentSpec } from '../onboarding-wizard/types/connect';
import {
  configToYaml,
  generateDefaultValue,
  getAllComponents,
  getCategories,
  getNodeConfigsByCategory,
  type SchemaNodeConfig,
} from '../onboarding-wizard/utils/connect';

interface SelectConfigTemplateProps {
  onSelect: (yaml: string) => void;
  className?: string;
  placeholder?: string;
}

// Category configuration with icons and styling
const getCategoryConfig = (category: string) => {
  switch (category) {
    case 'input':
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: 'Input',
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      };
    case 'output':
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      };
    case 'processor':
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      };
    case 'cache':
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      };
    case 'buffer':
      return {
        icon: <Layers className="h-3 w-3" />,
        text: 'Buffer',
        className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
      };
    case 'rate_limit':
      return {
        icon: <Timer className="h-3 w-3" />,
        text: 'Rate Limit',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      };
    case 'scanner':
      return {
        icon: <Search className="h-3 w-3" />,
        text: 'Scanner',
        className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: category.charAt(0).toUpperCase() + category.slice(1),
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      };
  }
};

// Status configuration with icons and styling
const getStatusConfig = (status: string) => {
  switch (status) {
    case 'stable':
      return {
        icon: <CheckCircle2 className="h-3 w-3" />,
        text: 'Stable',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
      };
    case 'beta':
      return {
        icon: <Clock className="h-3 w-3" />,
        text: 'Beta',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
      };
    case 'experimental':
      return {
        icon: <AlertTriangle className="h-3 w-3" />,
        text: 'Experimental',
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      };
    case 'deprecated':
      return {
        icon: <XCircle className="h-3 w-3" />,
        text: 'Deprecated',
        className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: status.charAt(0).toUpperCase() + status.slice(1),
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      };
  }
};

export const SelectConfigTemplate: React.FC<SelectConfigTemplateProps> = ({
  onSelect,
  className,
  placeholder = 'Select template...',
}) => {
  const [open, setOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<SchemaNodeConfig | null>(null);
  const enableServerlessOnboardingWizard = useBooleanFlagValue('enableServerlessOnboardingWizard');

  // Get all categories and their configurations
  const categories = useMemo(() => {
    return getCategories()
      .map((category) => ({
        ...category,
        configs: getNodeConfigsByCategory(category.id)
          .filter((config) => config.status !== 'deprecated') // Hide deprecated by default
          .sort((a, b) => {
            // Sort by status (stable first), then by name
            const statusOrder = { stable: 0, beta: 1, experimental: 2, deprecated: 3 };
            const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
            const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 4;

            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.name.localeCompare(b.name);
          }),
      }))
      .filter((category) => category.configs.length > 0) // Only show categories with configs
      .sort((a, b) => {
        // Prioritize input/output categories
        const order = ['input', 'output', 'processor', 'cache', 'buffer', 'rate_limit', 'scanner'];
        const aIndex = order.indexOf(a.id);
        const bIndex = order.indexOf(b.id);

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  }, []);

  if (!enableServerlessOnboardingWizard) return null;

  const handleConfigSelect = (config: SchemaNodeConfig) => {
    try {
      // Find the component specification for this config
      const componentSpec = findComponentSpec(config);

      if (!componentSpec) {
        console.warn(`Could not find component spec for ${config.name}`);
        return;
      }

      // Generate the base configuration
      const baseConfig = generateDefaultValue(componentSpec.config) as Record<string, unknown>;

      // Create the full configuration structure with proper format
      const fullConfig = {
        [config.category]: {
          label: '', // Common label field for component identification
          [config.name]: baseConfig,
        },
      };

      // Convert to YAML
      const yaml = configToYaml(fullConfig, componentSpec);

      // Update state and close popover
      setSelectedConfig(config);
      setOpen(false);

      onSelect(yaml);
    } catch (error) {
      console.error('Error generating config template:', error);
    }
  };

  // Helper to find the component specification from the schema
  const findComponentSpec = (config: SchemaNodeConfig): ComponentSpec | null => {
    const allComponents = getAllComponents();
    return allComponents.find((comp) => comp.name === config.name && comp.type === config.category) || null;
  };

  // Get display text for selected config
  const getSelectedDisplayText = () => {
    if (!selectedConfig) return placeholder;

    const categoryConfig = getCategoryConfig(selectedConfig.category);
    return (
      <div className="flex items-center gap-2">
        <span>{selectedConfig.name}</span>
        <Badge className={`flex items-center gap-1 ${categoryConfig.className} text-xs`}>
          {categoryConfig.icon}
          <span className="leading-none">{categoryConfig.text}</span>
        </Badge>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Label>
        Use a template
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('justify-between max-w-[300px]', className)}
          >
            {getSelectedDisplayText()}
            <ChevronsUpDown size={16} className="shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
      </Label>
      <PopoverContent className="p-0 w-[300px] border border-border">
        <Command variant="minimal" size="sm">
          <CommandInput placeholder="Search templates..." />
          <CommandList>
            <CommandEmpty>No templates found.</CommandEmpty>
            {categories.map((category, categoryIndex) => (
              <React.Fragment key={category.id}>
                {categoryIndex > 0 && <CommandSeparator />}
                <CommandGroup heading={category.name}>
                  {category.configs.map((config) => {
                    const categoryConfig = getCategoryConfig(config.category);
                    const statusConfig = getStatusConfig(config.status);

                    return (
                      <CommandItem
                        key={config.id}
                        onSelect={() => handleConfigSelect(config)}
                        className="flex-col items-start gap-2 py-3"
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{config.name}</span>
                            <div className="flex gap-1">
                              <Badge className={`flex items-center gap-1 ${categoryConfig.className} text-xs`}>
                                {categoryConfig.icon}
                                <span className="leading-none">{categoryConfig.text}</span>
                              </Badge>
                              <Badge className={`flex items-center gap-1 ${statusConfig.className} text-xs`}>
                                {statusConfig.icon}
                                <span className="leading-none">{statusConfig.text}</span>
                              </Badge>
                            </div>
                          </div>
                        </div>
                        {config.summary && (
                          <p className="text-muted-foreground text-sm leading-relaxed">{config.summary}</p>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SelectConfigTemplate;
