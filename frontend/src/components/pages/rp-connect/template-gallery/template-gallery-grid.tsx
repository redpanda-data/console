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

import { Button } from 'components/redpanda-ui/components/button';
import { Input, InputEnd, InputStart } from 'components/redpanda-ui/components/input';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useListComponentsQuery } from 'react-query/api/connect';

import {
  type PipelineTemplate,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_ORDER,
  type TemplateCategory,
} from './pipeline-template-types';
import { PIPELINE_TEMPLATES } from './pipeline-templates';
import { TemplateTile } from './template-tile';
import { parseSchema } from '../utils/schema';

type CategoryFilter = TemplateCategory | 'all';

const CATEGORY_FILTER_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  cdc: 'CDC',
  ingest: 'Ingest',
  analytics: 'Analytics',
  migration: 'Migration',
};

const FILTER_OPTIONS: CategoryFilter[] = ['all', ...TEMPLATE_CATEGORY_ORDER];

const matchesQuery = (template: PipelineTemplate, query: string): boolean => {
  if (!query.trim()) {
    return true;
  }
  const q = query.toLowerCase().trim();
  return (
    template.name.toLowerCase().includes(q) ||
    template.description.toLowerCase().includes(q) ||
    template.source.component.toLowerCase().includes(q) ||
    template.sink.component.toLowerCase().includes(q)
  );
};

const groupByCategory = (templates: PipelineTemplate[]): Map<TemplateCategory, PipelineTemplate[]> => {
  const grouped = new Map<TemplateCategory, PipelineTemplate[]>();
  for (const cat of TEMPLATE_CATEGORY_ORDER) {
    grouped.set(cat, []);
  }
  for (const t of templates) {
    grouped.get(t.category)?.push(t);
  }
  return grouped;
};

export type TemplateGalleryGridProps = {
  onSelect: (template: PipelineTemplate) => void;
};

export const TemplateGalleryGrid = ({ onSelect }: TemplateGalleryGridProps) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');

  const { data: componentListResponse, isLoading: isComponentListLoading } = useListComponentsQuery();
  const knownComponentNames = useMemo(() => {
    if (!componentListResponse?.components) {
      return new Set<string>();
    }
    const specs = parseSchema(componentListResponse.components);
    return new Set(specs.map((s) => s.name));
  }, [componentListResponse]);

  const visibleTemplates = useMemo(
    () =>
      PIPELINE_TEMPLATES.filter((t) => {
        if (
          knownComponentNames.size > 0 &&
          !(knownComponentNames.has(t.source.component) && knownComponentNames.has(t.sink.component))
        ) {
          return false;
        }
        if (activeFilter !== 'all' && t.category !== activeFilter) {
          return false;
        }
        return matchesQuery(t, query);
      }),
    [activeFilter, knownComponentNames, query]
  );

  const grouped = useMemo(() => groupByCategory(visibleTemplates), [visibleTemplates]);

  const hasFiltersActive = query.trim().length > 0 || activeFilter !== 'all';
  const clearFilters = () => {
    setQuery('');
    setActiveFilter('all');
  };

  return (
    <div className="flex flex-col gap-5" data-testid="template-gallery-grid">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="w-full sm:max-w-md"
          data-testid="template-gallery-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search templates..."
          value={query}
        >
          <InputStart>
            <Search className="h-4 w-4 text-muted-foreground" />
          </InputStart>
          {query.length > 0 ? (
            <InputEnd>
              <button
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setQuery('')}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </InputEnd>
          ) : null}
        </Input>
        <Tabs onValueChange={(value) => setActiveFilter(value as CategoryFilter)} value={activeFilter}>
          <TabsList className="h-9 w-fit border-b-0 bg-transparent" variant="underline">
            {FILTER_OPTIONS.map((filter) => (
              <TabsTrigger
                data-testid={`template-gallery-filter-${filter}`}
                key={filter}
                value={filter}
                variant="underline"
              >
                {CATEGORY_FILTER_LABELS[filter]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isComponentListLoading ? <GallerySkeleton /> : null}
      {!isComponentListLoading && visibleTemplates.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center"
          data-testid="template-gallery-empty"
        >
          <Search aria-hidden className="h-6 w-6 text-muted-foreground" />
          <Text variant="bodyStrongMedium">No templates match your search</Text>
          {hasFiltersActive ? (
            <Button onClick={clearFilters} size="sm" variant="outline">
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
      {!isComponentListLoading && visibleTemplates.length > 0 ? (
        <div className="flex flex-col gap-5">
          {TEMPLATE_CATEGORY_ORDER.map((category) => {
            const inCategory = grouped.get(category) ?? [];
            if (inCategory.length === 0) {
              return null;
            }
            return (
              <section
                aria-labelledby={`gallery-category-${category}`}
                className="flex flex-col gap-2.5"
                data-testid={`template-gallery-category-${category}`}
                key={category}
              >
                <Heading id={`gallery-category-${category}`} level={4}>
                  {TEMPLATE_CATEGORY_LABELS[category]}
                </Heading>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
                  {inCategory.map((template) => (
                    <TemplateTile key={template.id} onSelect={onSelect} template={template} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const GallerySkeleton = () => (
  <div className="flex flex-col gap-5">
    {[0, 1].map((row) => (
      <div className="flex flex-col gap-2.5" key={row}>
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((idx) => (
            <Skeleton className="h-[96px] w-full rounded-lg" key={idx} />
          ))}
        </div>
      </div>
    ))}
  </div>
);
