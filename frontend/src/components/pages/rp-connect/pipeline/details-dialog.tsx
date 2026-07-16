/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { isSystemTag } from 'components/constants';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import { Button } from 'components/redpanda-ui/components/button';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { ListItem } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { InfoIcon, List } from 'lucide-react';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type React from 'react';
import { useMemo } from 'react';

import { cpuToTasks } from '../tasks';
import { extractAllTopics } from '../utils/yaml';

type DetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline?: Pipeline;
  // Delete clicked in the Danger Zone. The parent should close this dialog and
  // open the delete confirmation so the two don't stack.
  onRequestDelete?: () => void;
};

const EMPTY_PLACEHOLDER = '—';

const SectionHeading = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <h3 className={cn('text-heading-md', className)}>{children}</h3>
);

type DetailRowProps = {
  label: React.ReactNode;
  value?: string;
  children?: React.ReactNode;
  copyable?: boolean;
  /** Let the value cell wrap across multiple lines instead of truncating. */
  wrap?: boolean;
};

const renderLabel = (label: React.ReactNode) => {
  if (typeof label === 'string') {
    return <div className="w-32 shrink-0 pt-0.5 text-label text-muted-foreground">{label}</div>;
  }
  return <div className="w-32 shrink-0 pt-0.5">{label ?? null}</div>;
};

const renderValue = (value: string | undefined, children: React.ReactNode | undefined, wrap: boolean) => {
  if (children !== undefined) {
    return children;
  }
  const hasValue = Boolean(value?.length);
  const displayValue = hasValue ? (value as string) : EMPTY_PLACEHOLDER;
  return (
    <div
      className={cn(
        'text-body',
        wrap ? 'whitespace-pre-wrap break-words' : 'truncate',
        hasValue ? '' : 'text-muted-foreground'
      )}
    >
      {displayValue}
    </div>
  );
};

// Fixed-width label on the left, value (or children) on the right. Values wrap
// with `wrap`, else truncate; copy button appears on hover.
const DetailRow = ({ label, value, children, copyable = false, wrap = false }: DetailRowProps) => {
  const showCopy = copyable && Boolean(value?.length);
  return (
    <div className="group/row flex min-w-0 items-start gap-4">
      {renderLabel(label)}
      <div className="flex min-w-0 flex-1 items-start gap-1">
        <div className="min-w-0 flex-1">{renderValue(value, children, wrap)}</div>
        {showCopy ? (
          <CopyButton
            className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100"
            content={value as string}
            size="sm"
            variant="ghost"
          />
        ) : null}
      </div>
    </div>
  );
};

const ComputeUnitsLabel = () => (
  <Tooltip>
    <div className="flex items-center gap-1 text-label text-muted-foreground">
      Compute units
      <TooltipTrigger>
        <InfoIcon className="-mt-0.5 size-3 cursor-pointer text-muted-foreground" />
      </TooltipTrigger>
    </div>
    <TooltipContent>One compute unit = 0.1 CPU and 400 MB memory</TooltipContent>
  </Tooltip>
);

// Badges when populated; otherwise a muted dash to keep the row layout stable.
const ReferenceList = ({ items }: { items: string[] }) => {
  if (items.length === 0) {
    return <div className="text-body text-muted-foreground">{EMPTY_PLACEHOLDER}</div>;
  }
  return (
    <BadgeGroup
      className="flex-wrap"
      maxVisible={3}
      renderOverflowContent={(overflow) => (
        <List>
          {items.slice(-overflow.length).map((item) => (
            <ListItem key={item}>{item}</ListItem>
          ))}
        </List>
      )}
      variant="simple-outline"
    >
      {items.map((item) => (
        <Badge key={item} variant="simple-outline">
          {item}
        </Badge>
      ))}
    </BadgeGroup>
  );
};

export function DetailsDialog({ open, onOpenChange, pipeline, onRequestDelete }: DetailsDialogProps) {
  const configYaml = pipeline?.configYaml;
  const secrets = useMemo(
    () => (configYaml ? getUniqueSecretNames(extractSecretReferences(configYaml)) : []),
    [configYaml]
  );

  const topics = useMemo(() => (configYaml ? extractAllTopics(configYaml) : []), [configYaml]);

  const visibleTags = useMemo(
    () => Object.entries(pipeline?.tags ?? {}).filter(([k]) => !isSystemTag(k)),
    [pipeline?.tags]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Pipeline details</DialogTitle>
        </DialogHeader>

        {pipeline ? (
          <DialogBody padding="md" spacing="none">
            {/* Section gaps live on this inner wrapper. Putting them on
                DialogBody's outer className doesn't work — DialogBody renders
                sentinels and a sticky shadow alongside the content wrapper,
                so a flex/gap on the outer would add space between *those*
                instead of between my sections. */}
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-3">
                <SectionHeading>General</SectionHeading>
                <DetailRow label="Name" value={pipeline.displayName} />
                <DetailRow copyable label="ID" value={pipeline.id} />
                <DetailRow label="Description" value={pipeline.description} wrap />
                <DetailRow copyable label="URL" value={pipeline.url} />
                {pipeline.serviceAccount ? (
                  <DetailRow copyable label="Service account" value={pipeline.serviceAccount.clientId} />
                ) : null}
                <DetailRow label={<ComputeUnitsLabel />} value={`${cpuToTasks(pipeline.resources?.cpuShares) ?? 0}`} />
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <SectionHeading>References</SectionHeading>
                <DetailRow label="Secrets">
                  <ReferenceList items={secrets} />
                </DetailRow>
                <DetailRow label="Topics">
                  <ReferenceList items={topics} />
                </DetailRow>
                <DetailRow label="Tags">
                  <ReferenceList items={visibleTags.map(([k, v]) => `${k}: ${v}`)} />
                </DetailRow>
              </section>

              {onRequestDelete ? (
                <>
                  <Separator />
                  <section className="flex flex-col gap-3">
                    <SectionHeading className="text-destructive">Danger zone</SectionHeading>
                    <div className="text-muted-foreground text-sm">
                      Deleting this pipeline is permanent and cannot be undone. Any secrets or resources used by this
                      pipeline will need to be cleaned up manually.
                    </div>
                    <div>
                      <Button onClick={onRequestDelete} variant="destructive-outline">
                        Delete pipeline
                      </Button>
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </DialogBody>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
