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
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Card } from 'components/redpanda-ui/components/card';
import { ArrowRight, type LucideIcon, SignalHigh, SignalLow, SignalMedium, Waypoints } from 'lucide-react';

import type { PipelineTemplate } from './pipeline-template-types';
import { ConnectorLogo } from '../onboarding/connector-logo';

// Bucket the rough `setupTimeMinutes` estimate into a coarse effort tier, since
// showing precise minutes would overstate its accuracy.
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
    <TonedIcon className="h-5 w-5" icon={Waypoints} tone="muted" />
  );
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">{inner}</div>
  );
};

export type TemplateTileProps = {
  template: PipelineTemplate;
  onSelect: (template: PipelineTemplate) => void;
};

export const TemplateTile = ({ template, onSelect }: TemplateTileProps) => {
  const { label: tierLabel, Icon: TierIcon } = setupTierFor(template.setupTimeMinutes);
  return (
    <button
      className="group h-full w-full cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      data-testid={`template-tile-${template.id}`}
      onClick={() => onSelect(template)}
      type="button"
    >
      <Card className="h-full" size="full" variant="standard">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ComponentIcon name={template.source.component} override={template.source.logoOverride} />
            <TonedIcon aria-hidden className="h-3.5 w-3.5 shrink-0" icon={ArrowRight} tone="muted" />
            <ComponentIcon name={template.sink.component} override={template.sink.logoOverride} />
          </div>
          <span
            className="flex shrink-0 items-center gap-0.5 text-body-sm leading-none text-muted-foreground"
            data-testid={`template-tile-tier-${template.id}`}
          >
            <TierIcon aria-hidden className="h-3.5 w-3.5" />
            {tierLabel}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-body leading-tight font-semibold text-foreground">{template.name}</span>
          <span className="line-clamp-2 text-body-sm leading-snug text-muted-foreground">{template.description}</span>
        </div>
      </Card>
    </button>
  );
};
