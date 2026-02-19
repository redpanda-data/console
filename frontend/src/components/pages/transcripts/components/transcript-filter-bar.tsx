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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Small, Text } from 'components/redpanda-ui/components/typography';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, ArrowLeft, Bot, Plus, RefreshCw, Sparkles, Wrench, X, Zap } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';
import { getTimeRanges } from 'utils/time-range';

import { ServiceFilter, type ServiceInfo } from './service-filter';

// Filter types
export type SpanFilterPreset = 'llm' | 'tool' | 'agent' | 'error' | 'slow';
export type AttributeOperator = 'equals' | 'not_equals';

export type SpanFilter = {
  id: string;
  type: 'preset' | 'attribute';
  label: string;
  preset?: SpanFilterPreset;
  attributeKey?: string;
  operator?: AttributeOperator;
  value?: string;
};

// Preset filter configuration
type PresetFilterConfig = {
  id: SpanFilterPreset;
  label: string;
  icon: LucideIcon;
};

const PRESET_FILTERS: PresetFilterConfig[] = [
  { id: 'llm', label: 'LLM Calls', icon: Sparkles },
  { id: 'tool', label: 'Tool Calls', icon: Wrench },
  { id: 'agent', label: 'Agent Spans', icon: Bot },
  { id: 'error', label: 'Errors Only', icon: AlertCircle },
  { id: 'slow', label: 'Slow (>5s)', icon: Zap },
];

// Valid OTel GenAI semantic convention attributes for span filtering
// Note: trace.id, span.id, span.name, service.name are NOT span attributes (they're top-level fields or resource attributes)
const ATTRIBUTE_SUGGESTIONS = [
  // GenAI - Agent (from OTel gen-ai-agent-spans)
  'gen_ai.agent.id',
  'gen_ai.agent.name',
  'gen_ai.agent.description',
  'gen_ai.conversation.id',
  'gen_ai.data_source.id',

  // GenAI - Operation & Provider
  'gen_ai.operation.name',
  'gen_ai.provider.name',

  // GenAI - Request
  'gen_ai.request.model',
  'gen_ai.request.temperature',
  'gen_ai.request.max_tokens',
  'gen_ai.request.top_p',
  'gen_ai.request.frequency_penalty',
  'gen_ai.request.presence_penalty',

  // GenAI - Response
  'gen_ai.response.id',
  'gen_ai.response.model',
  'gen_ai.response.finish_reasons',

  // GenAI - Tool
  'gen_ai.tool.name',
  'gen_ai.tool.call.id',
  'gen_ai.tool.description',
  'gen_ai.tool.type',

  // GenAI - Usage
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',

  // HTTP (for external tool calls)
  'http.request.method',
  'http.response.status_code',
  'url.full',
];

// Convert to Combobox options format
const ATTRIBUTE_OPTIONS = ATTRIBUTE_SUGGESTIONS.map((attr) => ({
  value: attr,
  label: attr,
}));

const OPERATOR_OPTIONS: { value: AttributeOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
];

const TIME_RANGES = getTimeRanges(24 * 60 * 60 * 1000); // Up to 24 hours

// Jumped state type (matching transcript-list-page)
type JumpedState = {
  startMs: number;
  endMs: number;
  label: string;
} | null;

export type TranscriptFilterBarProps = {
  // Filter state
  activePresets: SpanFilterPreset[];
  onPresetsChange: (presets: SpanFilterPreset[]) => void;
  attributeFilters: SpanFilter[];
  onAttributeFiltersChange: (filters: SpanFilter[]) => void;
  showFullTraces: boolean;
  onShowFullTracesChange: (show: boolean) => void;

  // Service filter
  services: ServiceInfo[];
  selectedServices: string[];
  onSelectedServicesChange: (services: string[]) => void;

  // Time range
  timeRange: string;
  onTimeRangeChange: (value: string) => void;

  // Jump navigation
  jumpedTo: JumpedState;
  onBackToNewest: () => void;

  // Refresh
  isLoading: boolean;
  onRefresh: () => void;
};

// Generate unique ID for filters
const generateFilterId = () => `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Attribute Filter Popover Component
const AttributeFilterPopover: FC<{
  onAddFilter: (filter: SpanFilter) => void;
}> = ({ onAddFilter }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [attributeKey, setAttributeKey] = useState('');
  const [operator, setOperator] = useState<AttributeOperator>('equals');
  const [value, setValue] = useState('');

  const getOperatorLabel = (op: AttributeOperator): string => {
    const labels: Record<AttributeOperator, string> = {
      equals: '=',
      not_equals: '!=',
    };
    return labels[op];
  };

  const handleAdd = () => {
    if (!(attributeKey && value)) {
      return;
    }

    const operatorLabel = getOperatorLabel(operator);

    onAddFilter({
      id: generateFilterId(),
      type: 'attribute',
      label: `${attributeKey} ${operatorLabel} ${value}`,
      attributeKey,
      operator,
      value,
    });

    // Reset form and close
    setAttributeKey('');
    setOperator('equals');
    setValue('');
    setIsOpen(false);
  };

  const isValid = attributeKey && value;

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button className="h-8 gap-1.5" size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          Attribute
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-3">
          <Text className="font-medium" variant="small">
            Add Attribute Filter
          </Text>

          {/* Attribute Key */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attr-key">Attribute</Label>
            <Combobox
              creatable={true}
              onChange={setAttributeKey}
              options={ATTRIBUTE_OPTIONS}
              placeholder="Select or type attribute..."
              value={attributeKey}
            />
          </div>

          {/* Operator */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attr-operator">Operator</Label>
            <Select onValueChange={(v) => setOperator(v as AttributeOperator)} value={operator}>
              <SelectTrigger className="h-8" id="attr-operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_OPTIONS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Value */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attr-value">Value</Label>
            <Input
              className="h-8"
              id="attr-value"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid) {
                  handleAdd();
                }
              }}
              placeholder="Enter value..."
              value={value}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={() => setIsOpen(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!isValid} onClick={handleAdd} size="sm">
              Add Filter
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Filter Pill Component
// Uses primary-inverted to match DataTableFacetedFilter pattern for selected filters
const FilterPill: FC<{
  filter: SpanFilter;
  onRemove: () => void;
}> = ({ filter, onRemove }) => (
  <Badge className="h-6 gap-1 pr-1" size="sm" variant="primary-inverted">
    {filter.label}
    <button
      aria-label={`Remove filter: ${filter.label}`}
      className="ml-0.5 rounded-sm p-0.5 hover:bg-primary/20"
      onClick={onRemove}
      type="button"
    >
      <X className="h-3 w-3" />
    </button>
  </Badge>
);

export const TranscriptFilterBar: FC<TranscriptFilterBarProps> = ({
  activePresets,
  onPresetsChange,
  attributeFilters,
  onAttributeFiltersChange,
  showFullTraces,
  onShowFullTracesChange,
  services,
  selectedServices,
  onSelectedServicesChange,
  timeRange,
  onTimeRangeChange,
  jumpedTo,
  onBackToNewest,
  isLoading,
  onRefresh,
}) => {
  const hasActiveFilters = activePresets.length > 0 || attributeFilters.length > 0 || selectedServices.length > 0;

  const togglePreset = (presetId: SpanFilterPreset) => {
    if (activePresets.includes(presetId)) {
      onPresetsChange(activePresets.filter((p) => p !== presetId));
    } else {
      onPresetsChange([...activePresets, presetId]);
    }
  };

  const removeAttributeFilter = (filterId: string) => {
    onAttributeFiltersChange(attributeFilters.filter((f) => f.id !== filterId));
  };

  const handleClearAll = () => {
    onPresetsChange([]);
    onAttributeFiltersChange([]);
    onSelectedServicesChange([]);
  };

  // Build active filter pills from presets
  const presetPills: SpanFilter[] = activePresets.map((presetId) => {
    const config = PRESET_FILTERS.find((p) => p.id === presetId);
    return {
      id: `preset-${presetId}`,
      type: 'preset',
      label: config?.label || presetId,
      preset: presetId,
    };
  });

  // Build service filter pills - look up display name from services list
  const servicePills: SpanFilter[] = selectedServices.map((serviceValue) => {
    // Find the display name for this service value
    const serviceInfo = services.find((s) => s.value === serviceValue);
    const displayName = serviceInfo?.name || serviceValue || 'unknown';
    return {
      id: `service-${serviceValue}`,
      type: 'attribute' as const, // Using 'attribute' type for pill rendering compatibility
      label: `Service: ${displayName}`,
    };
  });

  const allActiveFilters = [...servicePills, ...presetPills, ...attributeFilters];

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: Preset filters + controls */}
      <div className="flex items-center gap-1.5">
        {/* Back to newest button (when jumped) */}
        {jumpedTo !== null && (
          <Button className="h-8 gap-1.5" onClick={onBackToNewest} size="sm" variant="outline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to newest
          </Button>
        )}

        {/* Service filter dropdown */}
        <ServiceFilter onChange={onSelectedServicesChange} selected={selectedServices} services={services} />

        {/* Preset filter buttons */}
        {PRESET_FILTERS.map((preset) => {
          const isActive = activePresets.includes(preset.id);
          const Icon = preset.icon;
          return (
            <Button
              className="h-8 gap-1.5"
              key={preset.id}
              onClick={() => togglePreset(preset.id)}
              size="sm"
              variant={isActive ? 'primary' : 'outline'}
            >
              <Icon className="h-3.5 w-3.5" />
              {preset.label}
            </Button>
          );
        })}

        {/* Add attribute filter popover */}
        <AttributeFilterPopover onAddFilter={(filter) => onAttributeFiltersChange([...attributeFilters, filter])} />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Conditional: filter controls when active */}
        {hasActiveFilters ? (
          <>
            <div className="flex items-center space-x-2">
              <Switch checked={showFullTraces} id="full-traces-toggle" onCheckedChange={onShowFullTracesChange} />
              <Label className="cursor-pointer font-normal" htmlFor="full-traces-toggle">
                Full traces
              </Label>
            </div>
            <div className="h-4 w-px bg-border" />
            <Button onClick={handleClearAll} variant="ghost">
              Clear
            </Button>
          </>
        ) : null}

        {/* Jumped-to label */}
        {jumpedTo !== null && (
          <Small className="rounded bg-muted px-2 py-1 text-muted-foreground">Viewing: {jumpedTo.label}</Small>
        )}

        {/* Time range selector */}
        <Select disabled={jumpedTo !== null} onValueChange={onTimeRangeChange} value={timeRange}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Refresh button */}
        <Button className="h-8 w-8" disabled={isLoading} onClick={onRefresh} size="icon" variant="outline">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Row 2: Active filter pills (only when filters active) */}
      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {allActiveFilters.map((filter) => (
            <FilterPill
              filter={filter}
              key={filter.id}
              onRemove={() => {
                if (filter.id.startsWith('service-')) {
                  // Remove service filter - extract value from ID (can be empty string)
                  const serviceValue = filter.id.replace('service-', '');
                  onSelectedServicesChange(selectedServices.filter((s) => s !== serviceValue));
                } else if (filter.type === 'preset' && filter.preset) {
                  onPresetsChange(activePresets.filter((p) => p !== filter.preset));
                } else {
                  removeAttributeFilter(filter.id);
                }
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
