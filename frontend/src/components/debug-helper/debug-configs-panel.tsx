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

import { ElementTooltip } from 'components/misc/element-tooltip';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Empty, EmptyDescription } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { pluralizeWithNumber } from 'utils/string';

import { CONNECT_CONFIG_FIXTURES, type ConnectConfigFixture } from './connect-config-fixtures';
import { PIPELINE_END_RUNS, PipelineRunsCell } from '../pages/rp-connect/pipeline/pipeline-end-chip';
import { type PipelineEndStatus, summarizePipelineEndYaml } from '../pages/rp-connect/utils/input-end-behavior';

type BadgeProps = React.ComponentProps<typeof Badge>;

const TAG_TONE: Record<ConnectConfigFixture['tags'][number], BadgeProps['tone']> = {
  simple: 'success',
  medium: 'informative',
  complex: 'warning',
  'edge-case': 'brand',
  invalid: 'destructive',
  stops: 'primary',
};

const RUNS_LABEL = new Map(PIPELINE_END_RUNS.map((option) => [option.value, option.label]));

export function PopIn({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.span
      animate={{ opacity: 1, scale: 1 }}
      className={cn('inline-flex', className)}
      exit={{ opacity: 0, scale: 0.5 }}
      initial={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Empty>
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}

export function DebugSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-full overflow-hidden" size="sm" variant="standard">
      <CardHeader spacing="tight">
        <CardTitle>
          <span className="text-body-sm font-medium">{title}</span>
        </CardTitle>
        {description !== null && description !== undefined && description !== '' ? (
          <CardDescription>
            <span className="text-body-sm">{description}</span>
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type FixtureTag = ConnectConfigFixture['tags'][number];

// The Configs panel's sections, in the order they read.
const FIXTURE_GROUPS: {
  tag: FixtureTag;
  label: string;
  chip: string;
  description: string;
}[] = [
  { tag: 'simple', label: 'Simple', chip: 'Simple', description: 'Small pipelines to start from.' },
  { tag: 'medium', label: 'Medium', chip: 'Medium', description: 'One source, a few processors, one sink.' },
  {
    tag: 'complex',
    label: 'Complex',
    chip: 'Complex',
    description: 'Large, branching pipelines for the visual editor.',
  },
  {
    tag: 'edge-case',
    label: 'Edge cases',
    chip: 'Edge',
    description: 'Resource indirection, many secrets, editor perf.',
  },
  {
    tag: 'stops',
    label: 'Stop conditions',
    chip: 'Stops',
    description: 'Whether a pipeline ends on its own: input stop rows and the Runs column.',
  },
  { tag: 'invalid', label: 'Invalid', chip: 'Invalid', description: 'Configs the editor or Connect should reject.' },
];

// A stop-condition fixture lists under Stop conditions; any other under its first tag.
const groupOf = (f: ConnectConfigFixture): FixtureTag => (f.tags.includes('stops') ? 'stops' : f.tags[0]);

const SECRET_REF_RE = /\$\{secrets\.([A-Za-z0-9_]+)\}/g;

type FixtureEntry = {
  fixture: ConnectConfigFixture;
  group: FixtureTag;
  end: PipelineEndStatus;
  lineCount: number;
  /** Console secrets that must exist before Cloud saves it. */
  secrets: string[];
};

function ConfigFixtureRow({ entry }: { entry: FixtureEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { fixture, group, end, lineCount, secrets } = entry;

  return (
    <div className="border-b last:border-0">
      <Collapsible onOpenChange={setExpanded} open={expanded}>
        <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-muted/40">
          <CollapsibleTrigger
            aria-label={`${expanded ? 'Hide' : 'Show'} the YAML for ${fixture.name}`}
            render={
              <Button
                // biome-ignore lint/nursery/noTailwindRestyledComponents: Registry unstyled variant owns this compound control's appearance.
                className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                variant="unstyled"
              />
            }
          >
            <TonedIcon className="mt-1 size-3 shrink-0" icon={expanded ? ChevronDown : ChevronRight} tone="muted" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-body-sm font-medium">{fixture.name}</span>
                {fixture.tags.flatMap((tag) =>
                  tag === group
                    ? []
                    : [
                        <Badge className="shrink-0" key={tag} size="sm" tone={TAG_TONE[tag]} variant="subtle">
                          {tag}
                        </Badge>,
                      ]
                )}
              </span>
              <span className={cn('text-body-sm text-muted-foreground', !expanded && 'line-clamp-2')}>
                {fixture.description}
                {secrets.length > 0 ? (
                  <span className="whitespace-nowrap text-muted-foreground/70">
                    {' · '}
                    {pluralizeWithNumber(secrets.length, 'secret')}
                  </span>
                ) : null}
              </span>
            </span>
          </CollapsibleTrigger>
          <span className="w-28 shrink-0 pt-0.5">
            <PipelineRunsCell status={end} />
          </span>
          <ElementTooltip content="Copy YAML">
            <CopyButton
              aria-label={`Copy the YAML for ${fixture.name}`}
              className="shrink-0"
              content={fixture.yaml}
              size="icon-xs"
              variant="ghost"
            />
          </ElementTooltip>
        </div>
        <CollapsibleContent>
          <div className="flex flex-col gap-1.5 pr-3 pb-2.5 pl-7.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-sm text-muted-foreground">
              {pluralizeWithNumber(lineCount, 'line')} ·
              {secrets.length > 0 ? (
                <>
                  {' '}
                  needs {secrets.length === 1 ? 'the secret' : 'the secrets'}
                  {/* InlineCode's chip at the row's text size and line height */}
                  {secrets.map((name) => (
                    <code
                      className="relative rounded bg-surface-subtle px-1.25 font-mono text-body-sm leading-normal font-medium"
                      key={name}
                    >
                      {name}
                    </code>
                  ))}
                </>
              ) : (
                ' needs no secrets'
              )}
            </div>
            <SimpleCodeBlock
              allowCopy={false}
              className="my-0"
              code={fixture.yaml}
              language="yaml"
              maxHeight="sm"
              size="sm"
              width="full"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function ConnectConfigsPanel() {
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState<'all' | FixtureTag>('all');
  const entries = useMemo(
    (): FixtureEntry[] =>
      CONNECT_CONFIG_FIXTURES.map((fixture) => ({
        fixture,
        group: groupOf(fixture),
        // How it ends, as the pipelines list's Runs column reads it.
        end: summarizePipelineEndYaml(fixture.yaml).status,
        lineCount: fixture.yaml.split('\n').length,
        secrets: [...new Set(Array.from(fixture.yaml.matchAll(SECRET_REF_RE), (m) => m[1]))],
      })),
    []
  );
  const sections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = (e: FixtureEntry) =>
      !q ||
      [e.fixture.name, e.fixture.description, ...e.fixture.tags, RUNS_LABEL.get(e.end) ?? '', ...e.secrets].some((s) =>
        s.toLowerCase().includes(q)
      );
    return FIXTURE_GROUPS.filter((g) => shown === 'all' || g.tag === shown).flatMap((g) => {
      const matchingGroup = { ...g, entries: entries.filter((e) => e.group === g.tag && matches(e)) };
      return matchingGroup.entries.length > 0 ? [matchingGroup] : [];
    });
  }, [entries, filter, shown]);

  return (
    <div className="flex flex-col gap-3">
      {/* Stays in view while the list scrolls. Sticky offsets count from inside the scroller's padding,
            so the negative top and margins cancel it. */}
      <div className="sticky -top-4 z-10 -mx-5 -mt-4 flex flex-wrap items-center gap-2 border-b bg-background px-5 py-2">
        <Input
          aria-label="Filter configs by name, tag, secret or how they run"
          containerClassName="min-w-40 flex-1"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter configs…"
          size="sm"
          value={filter}
        />
        <ToggleGroup
          aria-label="Show"
          attached={false}
          onValueChange={([next]) => {
            if (next) {
              const tag = FIXTURE_GROUPS.find((group) => group.tag === next)?.tag;
              if (next === 'all') {
                setShown('all');
              } else if (tag) {
                setShown(tag);
              }
            }
          }}
          size="sm"
          value={[shown]}
        >
          <ToggleGroupItem value="all">
            <span className="text-body-sm">All</span>
          </ToggleGroupItem>
          {FIXTURE_GROUPS.map((g) => (
            <ToggleGroupItem key={g.tag} value={g.tag}>
              <span className="text-body-sm">{g.chip}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {sections.length === 0 ? (
        <EmptyState>No configs match “{filter}”.</EmptyState>
      ) : (
        sections.map((section) => (
          <section aria-label={section.label} className="overflow-hidden rounded-md border" key={section.tag}>
            <div className="flex items-baseline gap-2 border-b bg-muted/30 px-3 py-1.5">
              <span className="shrink-0 text-body-sm font-medium">{section.label}</span>
              <Badge className="shrink-0" size="sm" tone="default" variant="outline">
                {section.entries.length}
              </Badge>
              <span className="min-w-0 text-body-sm text-muted-foreground">{section.description}</span>
            </div>
            {section.entries.map((entry) => (
              <ConfigFixtureRow entry={entry} key={entry.fixture.id} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
