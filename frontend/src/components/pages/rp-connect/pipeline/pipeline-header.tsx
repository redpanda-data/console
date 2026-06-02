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

import { useNavigate } from '@tanstack/react-router';
import { getUserTagEntries } from 'components/constants';
import { ArrowLeftIcon, EditIcon } from 'components/icons';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Heading } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { BookOpen, ExternalLink, Info, InfoIcon, Settings } from 'lucide-react';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Fragment, type ReactNode, useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller, useFormState, useWatch } from 'react-hook-form';

import { PipelineStatusToggle } from './pipeline-status-toggle';
import { cpuToTasks } from '../tasks';
import { extractAllTopics } from '../utils/yaml';
import type { PipelineFormValues } from '.';

const DOCS_URL = 'https://docs.redpanda.com/redpanda-connect/home/';

type TagEntry = { key: string; value: string };

// Dot-separated strip of short scalar facts. Null nodes are dropped.
type MetaEntry = { key: string; node: ReactNode };

const MetaStrip = ({ items }: { items: MetaEntry[] }) => {
  const visible = items.filter((item) => item.node !== null);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-y-1 text-muted-foreground text-sm">
      {visible.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 ? (
            <span aria-hidden className="mx-2.5 select-none text-muted-foreground/50">
              ·
            </span>
          ) : null}
          {item.node}
        </Fragment>
      ))}
    </div>
  );
};

// Labelled line below the strip for wider fields (tags, description).
const DetailLine = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex gap-2 text-sm">
    <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
    <div className="min-w-0 flex-1 text-foreground">{children}</div>
  </div>
);

// "<n> compute units" with an inline definition tooltip for newcomers.
const ComputeUnitsMeta = ({ units }: { units: number }) => (
  <span className="flex items-center gap-1.5">
    <span className="font-medium text-foreground">{units}</span>
    compute {units === 1 ? 'unit' : 'units'}
    <Tooltip>
      <TooltipTrigger>
        <InfoIcon className="size-3 cursor-help text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>One compute unit = 0.1 CPU and 400 MB memory</TooltipContent>
    </Tooltip>
  </span>
);

// Count fact like "2 topics" — emphasised number, muted noun (pre-pluralised).
const CountMeta = ({ count, noun }: { count: number; noun: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="font-medium text-foreground">{count}</span>
    <span>{noun}</span>
  </span>
);

// Labelled value that reveals a copy button on hover; optionally an external link.
const CopyableMeta = ({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) => (
  <span className="group/meta flex min-w-0 items-center gap-1.5">
    <span className="shrink-0">{label}</span>
    {href ? (
      <a
        className="flex min-w-0 items-center gap-1 text-foreground hover:underline"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span className="max-w-[18rem] truncate" title={value}>
          {value}
        </span>
        <ExternalLink className="size-3 shrink-0" />
      </a>
    ) : (
      <span className={cn('max-w-[18rem] truncate text-foreground', mono && 'font-mono')} title={value}>
        {value}
      </span>
    )}
    <CopyButton
      className="shrink-0 opacity-0 transition-opacity group-hover/meta:opacity-100"
      content={value}
      size="sm"
      variant="ghost"
    />
  </span>
);

const TagBadges = ({ tags }: { tags: TagEntry[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {tags.map((t) => (
      <Badge key={t.key} variant="simple-outline">
        {t.value ? `${t.key}: ${t.value}` : t.key}
      </Badge>
    ))}
  </div>
);

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <Button className="-ml-3.5 shrink-0" onClick={onClick} size="icon" variant="ghost">
    <ArrowLeftIcon className="h-5 w-5" />
  </Button>
);

// Inline-editable pipeline name, styled as the page title. Bound to the same
// form field as the settings dialog, so editing either keeps both in sync.
const EditableTitle = ({ form, placeholder }: { form: UseFormReturn<PipelineFormValues>; placeholder: string }) => (
  <Controller
    control={form.control}
    name="name"
    render={({ field, fieldState }) => (
      <input
        {...field}
        aria-invalid={fieldState.invalid}
        aria-label="Pipeline name"
        className={cn(
          'min-w-[12rem] max-w-full field-sizing-content truncate border-transparent border-b bg-transparent py-0.5 font-display font-medium text-2xl leading-none tracking-heading',
          'placeholder:text-muted-foreground hover:border-border focus:border-input focus:outline-none',
          fieldState.error && 'border-destructive hover:border-destructive focus:border-destructive'
        )}
        placeholder={placeholder}
      />
    )}
  />
);

// View-mode header: pipeline name as the page title, with details/docs/edit
// actions. Status and the run control live in a separate ops bar below.
export function PipelineViewHeader({
  pipeline,
  onBack,
  onViewDetails,
}: {
  pipeline: Pipeline;
  onBack: () => void;
  onViewDetails: () => void;
}) {
  const navigate = useNavigate();
  const name = pipeline.displayName || pipeline.id;
  const units = cpuToTasks(pipeline.resources?.cpuShares) ?? 0;
  const description = pipeline.description?.trim();
  const tags = useMemo(() => getUserTagEntries(pipeline.tags), [pipeline.tags]);
  const topicCount = useMemo(
    () => (pipeline.configYaml ? extractAllTopics(pipeline.configYaml).length : 0),
    [pipeline.configYaml]
  );

  const items: MetaEntry[] = [
    { key: 'id', node: <CopyableMeta label="ID" mono value={pipeline.id} /> },
    { key: 'units', node: <ComputeUnitsMeta units={units} /> },
    {
      key: 'topics',
      node: topicCount > 0 ? <CountMeta count={topicCount} noun={topicCount === 1 ? 'topic' : 'topics'} /> : null,
    },
    {
      key: 'url',
      node: pipeline.url ? <CopyableMeta href={pipeline.url} label="Endpoint" value={pipeline.url} /> : null,
    },
  ];

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <BackButton onClick={onBack} />
          <Heading className="min-w-0 truncate" level={1} title={name}>
            {name}
          </Heading>
          <Button
            aria-label="View pipeline details"
            className="[&_svg]:size-4"
            icon={<Info />}
            onClick={onViewDetails}
            size="icon"
            variant="ghost"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button as="a" href={DOCS_URL} icon={<BookOpen />} rel="noopener noreferrer" target="_blank" variant="ghost">
            Docs
          </Button>
          <Button
            icon={<EditIcon />}
            onClick={() => navigate({ to: `/rp-connect/${pipeline.id}/edit` })}
            variant="secondary-outline"
          >
            Edit pipeline
          </Button>
          <div aria-hidden className="mx-1 h-6 w-px bg-border" />
          <PipelineStatusToggle pipelineId={pipeline.id} pipelineState={pipeline.state} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <MetaStrip items={items} />
        {tags.length > 0 ? (
          <DetailLine label="Tags">
            <TagBadges tags={tags} />
          </DetailLine>
        ) : null}
        {description ? (
          <DetailLine label="Description">
            <p className="line-clamp-2 whitespace-pre-wrap break-words" title={description}>
              {description}
            </p>
          </DetailLine>
        ) : null}
      </div>
    </header>
  );
}

// Edit / create header: name as the title with a mode chip; Docs + Save on the
// right. The settings the dialog controls are shown below, with "Edit settings"
// anchored to that block (away from Save).
export function PipelineEditHeader({
  form,
  mode,
  url,
  onBack,
  onSave,
  onEditSettings,
  isSaving,
}: {
  form: UseFormReturn<PipelineFormValues>;
  mode: 'edit' | 'create';
  url?: string;
  onBack: () => void;
  onSave: () => void;
  onEditSettings: () => void;
  isSaving?: boolean;
}) {
  const description = useWatch({ control: form.control, name: 'description' })?.trim();
  const units = useWatch({ control: form.control, name: 'computeUnits' });
  const tags = (useWatch({ control: form.control, name: 'tags' }) ?? []).filter((t) => t.key);
  const { errors } = useFormState({ control: form.control });
  const nameError = typeof errors.name?.message === 'string' ? errors.name.message : undefined;

  const items: MetaEntry[] = [
    { key: 'units', node: <ComputeUnitsMeta units={units} /> },
    { key: 'url', node: url ? <CopyableMeta href={url} label="Endpoint" value={url} /> : null },
  ];

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BackButton onClick={onBack} />
            <EditableTitle form={form} placeholder={mode === 'create' ? 'New pipeline' : 'Untitled pipeline'} />
            {mode === 'create' ? <Badge variant="simple-outline">New</Badge> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              as="a"
              href={DOCS_URL}
              icon={<BookOpen />}
              rel="noopener noreferrer"
              target="_blank"
              variant="ghost"
            >
              Docs
            </Button>
            <Button disabled={isSaving} onClick={onSave}>
              Save
              {isSaving ? <Spinner /> : null}
            </Button>
          </div>
        </div>
        {nameError ? <p className="pl-11 text-destructive text-sm">{nameError}</p> : null}
      </div>
      <div className="flex flex-col items-start gap-2">
        <MetaStrip items={items} />
        {tags.length > 0 ? (
          <DetailLine label="Tags">
            <TagBadges tags={tags} />
          </DetailLine>
        ) : null}
        {description ? (
          <DetailLine label="Description">
            <p className="whitespace-pre-wrap break-words" title={description}>
              {description}
            </p>
          </DetailLine>
        ) : null}
        <Button className="mt-1" icon={<Settings />} onClick={onEditSettings} size="sm" variant="outline">
          Edit settings
        </Button>
      </div>
    </header>
  );
}
