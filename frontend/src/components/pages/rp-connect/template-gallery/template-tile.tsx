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
import { Card } from 'components/redpanda-ui/components/card';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ArrowRight, type LucideIcon, SignalHigh, SignalLow, SignalMedium, Waypoints } from 'lucide-react';

import type { PipelineTemplate } from './pipeline-template-types';
import { ConnectorLogo } from '../onboarding/connector-logo';

// Bucket the per-template `setupTimeMinutes` estimate into a coarse effort tier.
// The underlying number is a rough author estimate (form-fill + external prep
// like credentials / database setup), so showing precise minutes overstates the
// accuracy. The tier label + matching signal icon conveys the at-a-glance
// signal without pretending to be exact.
type SetupTier = { label: string; Icon: LucideIcon };

const setupTierFor = (minutes: number): SetupTier => {
  if (minutes <= 5) {
    return { label: 'Quick', Icon: SignalLow };
  }
  if (minutes <= 10) {
    return { label: 'Standard', Icon: SignalMedium };
  }
  return { label: 'Advanced', Icon: SignalHigh };
};

const ComponentIcon = ({ name, override }: { name: string; override?: string }) => {
  const resolvedName = override ?? name;
  const inner = componentLogoMap[resolvedName as ComponentName] ? (
    <ConnectorLogo className="h-5 w-5" name={resolvedName as ComponentName} />
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

export const TemplateTile = ({ template, onSelect, className }: TemplateTileProps) => {
  const { label: tierLabel, Icon: TierIcon } = setupTierFor(template.setupTimeMinutes);
  return (
    <button
      className={cn(
        'group h-full w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
        className
      )}
      data-testid={`template-tile-${template.id}`}
      onClick={() => onSelect(template)}
      type="button"
    >
      <Card
        className="flex h-full cursor-pointer flex-col gap-2.5 rounded-md border-2 border-solid p-4 shadow-none transition-all hover:shadow-elevated"
        size="full"
        variant="standard"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ComponentIcon name={template.source.component} override={template.source.logoOverride} />
            <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <ComponentIcon name={template.sink.component} override={template.sink.logoOverride} />
          </div>
          <span
            className="flex shrink-0 items-center gap-0.5 text-muted-foreground text-xs leading-none"
            data-testid={`template-tile-tier-${template.id}`}
          >
            <TierIcon aria-hidden className="h-3.5 w-3.5" />
            {tierLabel}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground text-sm leading-tight">{template.name}</span>
          <span className="line-clamp-2 text-muted-foreground text-xs leading-snug">{template.description}</span>
        </div>
      </Card>
    </button>
  );
};
