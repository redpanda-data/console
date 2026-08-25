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
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import { Button } from 'components/redpanda-ui/components/button';
import { ButtonGroup } from 'components/redpanda-ui/components/button-group';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { List, ListItem } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ExternalLink,
  Info,
  InfoIcon,
  Play,
  Settings,
  Trash2,
} from 'lucide-react';
import type { Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Fragment, type ReactNode, useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller, useWatch } from 'react-hook-form';
import { docsLinks } from 'utils/docs-links';

import { UNSAVED_CHANGES_PILL_TOOLTIP } from './changes-summary';
import { DRAFT_BADGE_TOOLTIP, draftIssueSummary, isDraft, relativeAgeLabel, timestampToMillis } from './draft-copy';
import { PipelineRunButton, PipelineStateBadge } from './pipeline-run-controls';
import {
  alternateRunIntents,
  primaryRunIntent,
  runIntentLabel,
  type SaveContext,
  type SaveIntent,
  saveRunHint,
} from './save-actions';
import { useStartDraft } from './use-start-draft';
import { cpuToTasks } from '../tasks';
import { extractAllTopics } from '../utils/yaml';
import type { PipelineFormValues } from '.';

const DOCS_URL = docsLinks.cloud.connectQuickstart;

type TagEntry = { key: string; value: string };

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

const DetailLine = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex gap-2 text-sm">
    <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
    <div className="min-w-0 flex-1 text-foreground">{children}</div>
  </div>
);

// Description gets its own block (not the narrow key/value column): quiet label, prose width, kept line breaks.
const DescriptionBlock = ({ text, clamp }: { text: string; clamp?: boolean }) => (
  <div className="flex flex-col gap-0.5 text-sm">
    <span className="text-muted-foreground">Description</span>
    <p
      className={cn(
        'max-w-prose whitespace-pre-wrap break-words text-foreground leading-relaxed',
        clamp && 'line-clamp-2'
      )}
      title={text}
    >
      {text}
    </p>
  </div>
);

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

const CountMeta = ({ count, noun }: { count: number; noun: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="font-medium text-foreground">{count}</span>
    <span>{noun}</span>
  </span>
);

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

const tagLabel = (t: TagEntry) => (t.value ? `${t.key}: ${t.value}` : t.key);

const TagBadges = ({ tags }: { tags: TagEntry[] }) => (
  <BadgeGroup
    className="flex-wrap"
    maxVisible={4}
    renderOverflowContent={(overflow) => (
      <List>
        {tags.slice(-overflow.length).map((t) => (
          <ListItem key={t.key}>{tagLabel(t)}</ListItem>
        ))}
      </List>
    )}
    variant="simple-outline"
  >
    {tags.map((t) => (
      <Badge key={t.key} variant="simple-outline">
        {tagLabel(t)}
      </Badge>
    ))}
  </BadgeGroup>
);

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <Button className="-ml-3.5 shrink-0" onClick={onClick} size="icon" variant="ghost">
    <ArrowLeftIcon className="h-5 w-5" />
  </Button>
);

/**
 * Offered wherever a draft is open. Abandoned drafts are the expected outcome of parking work and never
 * expire, so the way to be rid of one has to be in reach.
 */
const DeleteDraftButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    aria-label="Delete draft"
    className="shrink-0"
    onClick={onClick}
    size="icon"
    testId="delete-draft"
    title="Delete draft"
    variant="ghost"
  >
    <Trash2 />
  </Button>
);

// Expanded mode insets the header while the panel below it goes flush.
const headerClassName = (expanded: boolean) =>
  cn('flex flex-col gap-3 transition-[padding] duration-300 ease-in-out', expanded && 'px-4');

// Inline-editable pipeline name, bound to the same form field as the settings dialog.
const EditableTitle = ({ form, placeholder }: { form: UseFormReturn<PipelineFormValues>; placeholder: string }) => (
  <Controller
    control={form.control}
    name="name"
    render={({ field, fieldState }) => (
      <div className="flex min-w-0 flex-col">
        <input
          {...field}
          aria-invalid={fieldState.invalid}
          aria-label="Pipeline name"
          className={cn(
            'field-sizing-content min-w-[12rem] max-w-full truncate border-transparent border-b bg-transparent py-0.5 font-display font-medium text-2xl leading-none tracking-heading',
            'placeholder:text-muted-foreground hover:border-border focus:border-input focus:outline-none',
            fieldState.error && 'border-destructive hover:border-destructive focus:border-destructive'
          )}
          placeholder={placeholder}
        />
        {fieldState.error ? <p className="mt-1 text-destructive text-sm">{fieldState.error.message}</p> : null}
      </div>
    )}
  />
);

/**
 * A draft starts through its own mutation — a rejected start has to open the editor, since that is the
 * only place its lint problems are actionable — but it wears the same button as every other pipeline, so
 * "start" looks like one thing across the feature.
 */
const RunControl = ({ pipeline }: { pipeline: Pipeline }) => {
  const { startDraft, isStartingDraft } = useStartDraft();
  if (!isDraft(pipeline)) {
    return <PipelineRunButton pipelineId={pipeline.id} pipelineState={pipeline.state} />;
  }
  return (
    <Button
      disabled={isStartingDraft}
      icon={isStartingDraft ? <Spinner /> : <Play />}
      onClick={() => startDraft(pipeline.id)}
      testId="start-draft"
    >
      Start pipeline
    </Button>
  );
};

export function PipelineViewHeader({
  pipeline,
  onBack,
  onViewDetails,
  onRequestDelete,
  expanded,
}: {
  pipeline: Pipeline;
  onBack: () => void;
  onViewDetails: () => void;
  /** Opens the delete confirmation. Offered inline on a draft; other pipelines use the details dialog. */
  onRequestDelete?: () => void;
  expanded: boolean;
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

  const viewingDraft = isDraft(pipeline);
  const editedAt = timestampToMillis(pipeline.updateTime);

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
    // Who parked it and when — a shared draft pool with no author is a shared mutable pool.
    {
      key: 'edited',
      node: viewingDraft && editedAt ? <span>Edited {relativeAgeLabel(editedAt)}</span> : null,
    },
    {
      key: 'author',
      node: viewingDraft && pipeline.createdBy ? <span>by {pipeline.createdBy}</span> : null,
    },
  ];

  return (
    <header className={headerClassName(expanded)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <BackButton onClick={onBack} />
          <h1 className="min-w-0 truncate text-heading-xl" title={name}>
            {name}
          </h1>
          {/* State sits with the name, not on the run button: Draft is one of these states, so this is the
              one place to read what a pipeline is doing, whatever it is doing. */}
          <PipelineStateBadge state={pipeline.state} tooltip={viewingDraft ? DRAFT_BADGE_TOOLTIP : undefined} />
          <Button
            aria-label="View pipeline details"
            icon={<Info className="size-4!" />}
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
            {viewingDraft ? 'Continue editing' : 'Edit pipeline'}
          </Button>
          {viewingDraft && onRequestDelete ? <DeleteDraftButton onClick={onRequestDelete} /> : null}
          {/* self-center: the Separator's default self-stretch top-aligns a fixed h-6 in this row. */}
          <Separator className="mx-1 h-6 self-center" orientation="vertical" />
          <RunControl pipeline={pipeline} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <MetaStrip items={items} />
        {tags.length > 0 ? (
          <DetailLine label="Tags">
            <TagBadges tags={tags} />
          </DetailLine>
        ) : null}
        {description ? <DescriptionBlock clamp text={description} /> : null}
      </div>
    </header>
  );
}

/**
 * The primary click never starts or stops anything the user didn't ask for; the menu holds the explicit
 * run actions.
 */
const SaveActions = ({
  context,
  isSaving,
  onSave,
}: {
  context: SaveContext;
  isSaving?: boolean;
  onSave: (intent?: SaveIntent) => void;
}) => {
  const primary = primaryRunIntent(context);
  const alternates = alternateRunIntents(context).filter((intent) => intent !== primary);
  return (
    <ButtonGroup>
      <Button disabled={isSaving} onClick={() => onSave({ run: primary })} testId="save-pipeline">
        {runIntentLabel(primary, context)}
        {isSaving ? <Spinner /> : null}
      </Button>
      {alternates.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label="More save options" disabled={isSaving} size="icon" testId="save-pipeline-options">
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {alternates.map((intent) => (
              <DropdownMenuItem key={intent} onClick={() => onSave({ run: intent })}>
                {runIntentLabel(intent, context)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </ButtonGroup>
  );
};

export function PipelineEditHeader({
  form,
  mode,
  url,
  onBack,
  onSave,
  onEditSettings,
  onRequestDelete,
  isSaving,
  hasUnsavedChanges,
  expanded,
  pipelineState,
  draftsEnabled,
  draftIssueCount,
}: {
  form: UseFormReturn<PipelineFormValues>;
  mode: 'edit' | 'create';
  url?: string;
  onBack: () => void;
  onSave: (intent?: SaveIntent) => void;
  onEditSettings: () => void;
  /** Opens the delete confirmation. Only offered while editing a draft. */
  onRequestDelete?: () => void;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  expanded: boolean;
  /** Current run state, for the save hint and the alternate run action. Absent while creating. */
  pipelineState?: Pipeline_State;
  /** Whether this deployment can store drafts at all. */
  draftsEnabled: boolean;
  /** Outstanding lint issues, shown on a draft as what stands between it and starting. */
  draftIssueCount?: number;
}) {
  const description = useWatch({ control: form.control, name: 'description' })?.trim();
  const units = useWatch({ control: form.control, name: 'computeUnits' });
  const tags = (useWatch({ control: form.control, name: 'tags' }) ?? []).filter((t) => t.key);
  const context: SaveContext = { mode, state: pipelineState, draftsEnabled };
  const runHint = saveRunHint(context);
  const editingDraft = isDraft({ state: pipelineState });
  // Lint is a warning on a draft, not a blocked save, so the count is stated rather than enforced.
  const issueSummary = editingDraft ? draftIssueSummary(draftIssueCount ?? 0) : null;

  const items: MetaEntry[] = [
    { key: 'units', node: <ComputeUnitsMeta units={units} /> },
    { key: 'url', node: url ? <CopyableMeta href={url} label="Endpoint" value={url} /> : null },
  ];

  return (
    <header className={headerClassName(expanded)}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BackButton onClick={onBack} />
            <EditableTitle form={form} placeholder={mode === 'create' ? 'New pipeline' : 'Untitled pipeline'} />
            {/* Same badge as the view header, so Draft doesn't change appearance on the way into the editor. */}
            {editingDraft ? <PipelineStateBadge state={pipelineState} tooltip={DRAFT_BADGE_TOOLTIP} /> : null}
            {mode === 'create' ? <Badge variant="simple-outline">New</Badge> : null}
            <Button className="shrink-0" icon={<Settings />} onClick={onEditSettings} size="sm" variant="outline">
              Edit settings
            </Button>
            {editingDraft && onRequestDelete ? <DeleteDraftButton onClick={onRequestDelete} /> : null}
          </div>
          {/* Relative anchor: the hints sit below (absolute) so toggling them never shifts the buttons. */}
          <div className="relative flex shrink-0 items-center gap-2">
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
            <SaveActions context={context} isSaving={isSaving} onSave={onSave} />
            <span className="absolute top-full right-0 mt-1.5 flex items-center gap-2 whitespace-nowrap text-muted-foreground text-xs">
              {/* role=status: the pill appears without the user acting on this part of the page, and it
                  is the answer to "do I still need to save". */}
              {hasUnsavedChanges ? (
                <span className="flex items-center gap-1.5" role="status" title={UNSAVED_CHANGES_PILL_TOOLTIP}>
                  <span aria-hidden className="size-2 rounded-full bg-informative" />
                  Unsaved changes
                </span>
              ) : null}
              {hasUnsavedChanges && runHint ? <span aria-hidden>·</span> : null}
              {runHint ? <span>{runHint}</span> : null}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <MetaStrip items={items} />
        {issueSummary ? (
          <span className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle className="size-3.5" />
            {issueSummary}
          </span>
        ) : null}
        {tags.length > 0 ? (
          <DetailLine label="Tags">
            <TagBadges tags={tags} />
          </DetailLine>
        ) : null}
        {description ? <DescriptionBlock text={description} /> : null}
      </div>
    </header>
  );
}
