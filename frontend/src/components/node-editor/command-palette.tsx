'use client';

import type { SchemaNodeConfig } from '@/components/node-editor/redpanda-connect/schema-loader';
import { useAppStore } from '@/components/node-editor/store';
import { Badge } from '@/components/redpanda-ui/badge';
import { Button } from '@/components/redpanda-ui/button';
import { Checkbox } from '@/components/redpanda-ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/redpanda-ui/collapsible';
import { Input } from '@/components/redpanda-ui/input';
import { cn } from '@/lib/utils';
import { useReactFlow } from '@xyflow/react';
import {
  Cable,
  ChevronsUpDown,
  Cpu,
  Database,
  FileInput,
  FileOutput,
  Filter,
  GripVertical,
  Layers,
  Merge,
  Plus,
  Search,
  Settings,
  Spline,
  Split,
  Timer,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { getComponentSections } from './component-sections';

export const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'stable':
      return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'beta':
      return 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30';
    case 'experimental':
      return 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30';
    case 'deprecated':
      return 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-400 border-neutral-400/30';
    default:
      return 'bg-neutral-300/20 text-neutral-600 dark:text-neutral-400 border-neutral-300/30';
  }
};

export const getCategoryBadgeStyle = (category: string) => {
  switch (category) {
    case 'input':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
    case 'output':
      return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30';
    case 'processor':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
    case 'cache':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
    case 'buffer':
      return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
    case 'rate_limit':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
    case 'scanner':
      return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30';
    default:
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
  }
};

export const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'input':
      return FileInput;
    case 'output':
      return FileOutput;
    case 'processor':
      return Cpu;
    case 'cache':
      return Database;
    case 'buffer':
      return Layers;
    case 'rate_limit':
      return Timer;
    case 'scanner':
      return Search;
    default:
      return Settings;
  }
};

interface DraggableItemProps {
  config: SchemaNodeConfig;
}

interface CommonNodeConfig {
  id: string;
  name: string;
  summary?: string;
  icon: React.ComponentType<{ className?: string }>;
  type: 'transform-node' | 'join-node' | 'branch-node';
}

interface CommonDraggableItemProps {
  config: CommonNodeConfig;
}

function CommonDraggableItem({ config }: CommonDraggableItemProps) {
  const { screenToFlowPosition } = useReactFlow();
  const addNodeByType = useAppStore((state) => state.addNodeByType);
  const [isDragging, setIsDragging] = useState(false);

  const onClick = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNodeByType(config.type, position);
  }, [config.type, addNodeByType, screenToFlowPosition]);

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/common-node', JSON.stringify(config));
      setIsDragging(true);
    },
    [config],
  );

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      className={cn(
        'relative border rounded-md p-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-md',
        isDragging ? 'border-blue-500 shadow-lg scale-105' : 'border-border hover:border-blue-300',
        'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
      )}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      draggable
    >
      {isDragging && (
        <span
          role="presentation"
          className="absolute -top-2 -right-2 rounded-full border-2 border-blue-500 bg-card p-1"
        >
          <Plus className="h-3 w-3" />
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <config.icon className="h-4 w-4 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate">{config.name}</div>
            {config.summary && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{config.summary}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function DraggableItem({ config }: DraggableItemProps) {
  const { screenToFlowPosition } = useReactFlow();
  const addRedpandaNode = useAppStore((state) => state.addRedpandaNode);
  const [isDragging, setIsDragging] = useState(false);

  const onClick = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addRedpandaNode(config, position);
  }, [config, addRedpandaNode, screenToFlowPosition]);

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/redpanda-connect', JSON.stringify(config));
      setIsDragging(true);
    },
    [config],
  );

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const statusColor = getStatusBadgeStyle(config.status);
  const categoryColor = getCategoryBadgeStyle(config.category);

  return (
    <div
      className={cn(
        'relative border rounded-md p-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-md',
        isDragging ? 'border-blue-500 shadow-lg scale-105' : 'border-border hover:border-blue-300',
        categoryColor,
      )}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      draggable
    >
      {isDragging && (
        <span
          role="presentation"
          className="absolute -top-2 -right-2 rounded-full border-2 border-blue-500 bg-card p-1"
        >
          <Plus className="h-3 w-3" />
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate">{config.name}</div>
            {config.summary && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{config.summary}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {config.version && (
            <Badge variant="secondary" className="text-xs">
              v{config.version}
            </Badge>
          )}
          <Badge className={`text-xs ${statusColor}`}>{config.status}</Badge>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

type StatusFilter = 'stable' | 'beta' | 'experimental' | 'deprecated';

interface ComponentSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  configs: SchemaNodeConfig[];
  searchQuery: string;
}

interface CommonComponentSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  configs: CommonNodeConfig[];
  searchQuery: string;
}

function CommonComponentSection({ title, icon: Icon, configs, searchQuery }: CommonComponentSectionProps) {
  const filteredConfigs = configs.filter((config) => {
    if (!searchQuery) return true;
    return (
      config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      config.summary?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <Collapsible>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="outline" className="text-xs">
            {filteredConfigs.length}
          </Badge>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-9 p-0">
            <ChevronsUpDown className="h-4 w-4" />
            <span className="sr-only">Toggle {title}</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        {filteredConfigs.length > 0 ? (
          <div className="space-y-2">
            {filteredConfigs.map((config) => (
              <CommonDraggableItem key={config.id} config={config} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            {searchQuery
              ? `No ${title.toLowerCase()} found matching "${searchQuery}"`
              : `No ${title.toLowerCase()} components available`}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ComponentSection({ title, icon: Icon, configs, searchQuery }: ComponentSectionProps) {
  return (
    <Collapsible>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="outline" className="text-xs">
            {configs.length}
          </Badge>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-9 p-0">
            <ChevronsUpDown className="h-4 w-4" />
            <span className="sr-only">Toggle {title}</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        {configs.length > 0 ? (
          <div className="space-y-2">
            {configs.map((config) => (
              <DraggableItem key={config.id} config={config} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            {searchQuery
              ? `No ${title.toLowerCase()} found matching "${searchQuery}"`
              : `No ${title.toLowerCase()} components available`}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CommandPalette() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilter>>(new Set(['stable']));

  // Common nodes configuration
  const commonNodes: CommonNodeConfig[] = [
    {
      id: 'transform-node',
      name: 'Transform',
      summary: 'Transform and modify data as it flows through the pipeline',
      icon: Spline,
      type: 'transform-node',
    },
    {
      id: 'join-node',
      name: 'Join',
      summary: 'Merge multiple data streams into a single output',
      icon: Split,
      type: 'join-node',
    },
    {
      id: 'branch-node',
      name: 'Branch',
      summary: 'Split data flow into multiple conditional paths',
      icon: Merge,
      type: 'branch-node',
    },
  ];

  // Apply filters
  const applyFilters = (configs: SchemaNodeConfig[]) => {
    return configs.filter((config) => {
      // Status filter
      if (!statusFilters.has(config.status as StatusFilter)) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        return (
          config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          config.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          config.categories?.some((category) => category.toLowerCase().includes(searchQuery.toLowerCase()))
        );
      }

      return true;
    });
  };

  // Get section configurations with applied filters
  const sections = getComponentSections(applyFilters);

  const toggleStatusFilter = (status: StatusFilter) => {
    setStatusFilters((prev) => {
      const newFilters = new Set(prev);
      if (newFilters.has(status)) {
        newFilters.delete(status);
      } else {
        newFilters.add(status);
      }
      return newFilters;
    });
  };

  const selectAllStatusFilters = () => {
    setStatusFilters(new Set(statusOptions));
  };

  const statusOptions: StatusFilter[] = ['stable', 'beta', 'experimental', 'deprecated'];

  return (
    <>
      <div className="p-6 pb-3">
        <h3 className="font-semibold leading-none tracking-tight flex items-center gap-2">
          <Search className="h-4 w-4" />
          Component Palette
        </h3>
        <div className="space-y-3 mt-4">
          <Input
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8"
          />
          <p className="text-xs text-muted-foreground">Drag components onto the canvas to build your pipeline</p>
          {/* Status Filters */}
          <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Status Filters</span>
              </div>
              <Button variant="ghost" size="sm" onClick={selectAllStatusFilters} className="h-6 px-2 text-xs">
                Select All
              </Button>
            </div>
            <div className="space-y-2">
              {statusOptions.map((status) => (
                <div key={status} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status}`}
                    checked={statusFilters.has(status)}
                    onCheckedChange={() => toggleStatusFilter(status)}
                  />
                  <label
                    htmlFor={`status-${status}`}
                    className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    <Badge className={cn('text-xs', getStatusBadgeStyle(status))}>{status}</Badge>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-3">
        <div className="h-full overflow-y-auto">
          <div className="space-y-4">
            <CommonComponentSection title="Common" icon={Cable} configs={commonNodes} searchQuery={searchQuery} />
            {sections.map((section) => (
              <ComponentSection
                key={section.title}
                title={section.title}
                icon={section.icon}
                configs={section.configs}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
