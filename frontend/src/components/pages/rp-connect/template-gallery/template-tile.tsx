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
import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ArrowRight, Clock, Waypoints } from 'lucide-react';

import type { PipelineTemplate } from './pipeline-template-types';
import { ConnectorLogo } from '../onboarding/connector-logo';

const ComponentIcon = ({ name }: { name: string }) => {
  const inner = componentLogoMap[name as ComponentName] ? (
    <ConnectorLogo className="h-6 w-6" name={name as ComponentName} />
  ) : (
    <Waypoints className="h-6 w-6 text-muted-foreground" />
  );
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">{inner}</div>
  );
};

export type TemplateTileProps = {
  template: PipelineTemplate;
  onSelect: (template: PipelineTemplate) => void;
  className?: string;
};

export const TemplateTile = ({ template, onSelect, className }: TemplateTileProps) => (
  <Card
    className={cn(
      'group h-full cursor-pointer transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary',
      className
    )}
    data-testid={`template-tile-${template.id}`}
    onClick={() => onSelect(template)}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(template);
      }
    }}
    role="button"
    size="full"
    tabIndex={0}
    variant="outlined"
  >
    <CardContent className="flex flex-col gap-3" padding="none">
      <div className="flex items-center gap-2">
        <ComponentIcon name={template.source.component} />
        <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <ComponentIcon name={template.sink.component} />
        <Badge className="ml-auto" size="sm" variant="neutral">
          <Clock aria-hidden className="mr-1 h-3 w-3" />~{template.setupTimeMinutes} min
        </Badge>
      </div>
      <div className="flex flex-col gap-1">
        <Text className="font-semibold text-base leading-tight">{template.name}</Text>
        <Text className="line-clamp-2 text-muted-foreground text-sm" variant="small">
          {template.description}
        </Text>
      </div>
    </CardContent>
  </Card>
);
