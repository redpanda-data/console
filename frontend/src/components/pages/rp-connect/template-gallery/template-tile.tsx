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

import { type ComponentName, componentLogoMap } from 'assets/connectors/component-logo-map';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ArrowRight, Clock, Waypoints } from 'lucide-react';

import type { PipelineTemplate } from './pipeline-template-types';
import { ConnectorLogo } from '../onboarding/connector-logo';

const ComponentIcon = ({ name }: { name: string }) => {
  const inner = componentLogoMap[name as ComponentName] ? (
    <ConnectorLogo className="h-5 w-5" name={name as ComponentName} />
  ) : (
    <Waypoints className="h-5 w-5 text-muted-foreground" />
  );
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">{inner}</div>
  );
};

export type TemplateTileProps = {
  template: PipelineTemplate;
  onSelect: (template: PipelineTemplate) => void;
  className?: string;
};

export const TemplateTile = ({ template, onSelect, className }: TemplateTileProps) => (
  <button
    className={cn(
      'group flex h-full w-full cursor-pointer flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5 text-left ring-0 ring-primary/30 transition-colors duration-150 hover:border-primary/60 hover:bg-primary/5 hover:ring-1 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
      className
    )}
    data-testid={`template-tile-${template.id}`}
    onClick={() => onSelect(template)}
    type="button"
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <ComponentIcon name={template.source.component} />
        <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <ComponentIcon name={template.sink.component} />
      </div>
      <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
        <Clock aria-hidden className="h-3 w-3" />~{template.setupTimeMinutes} min
      </span>
    </div>
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold text-foreground text-sm leading-tight">{template.name}</span>
      <span className="line-clamp-2 text-muted-foreground text-xs leading-snug">{template.description}</span>
    </div>
  </button>
);
