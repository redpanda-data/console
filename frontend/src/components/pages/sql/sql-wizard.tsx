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
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Input } from 'components/redpanda-ui/components/input';
import { cn } from 'components/redpanda-ui/lib/utils';
import { GitBranch, GitMerge, Layers, Plus, X } from 'lucide-react';
import { useState } from 'react';

export type WizardTopic = {
  name: string;
  partitions?: number;
  format?: string;
  iceberg?: boolean;
};

export type SqlWizardProps = {
  topics: WizardTopic[];
  onClose: () => void;
  onCreate: (args: { topic: string; tableName: string }) => void;
  isCreating?: boolean;
  error?: string;
};

const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;
const STEPS = ['Choose a topic', 'Name the table'] as const;

function createSQL(tableName: string, topic: string): string {
  return `CREATE TABLE default_redpanda_catalog=>${tableName || 'my_table'}\n  WITH (topic='${topic || 'topic_name'}');`;
}

export function SqlWizard({ topics, onClose, onCreate, isCreating, error }: SqlWizardProps) {
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [search, setSearch] = useState('');

  const chosen = topics.find((t) => t.name === topic);
  const tableName = name || topic || '';
  const nameError = touched && step === 1 && !TABLE_NAME_RE.test(tableName);

  const q = search.trim().toLowerCase();
  const visibleTopics = q ? topics.filter((t) => t.name.toLowerCase().includes(q)) : topics;

  const pickTopic = (t: WizardTopic) => {
    setTopic(t.name);
    if (!name) {
      setName(t.name);
    }
  };

  const next = () => {
    if (step === 0 && !topic) {
      return;
    }
    setStep(1);
  };

  const finish = () => {
    setTouched(true);
    if (!(topic && TABLE_NAME_RE.test(tableName))) {
      return;
    }
    onCreate({ topic, tableName });
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-card">
      <div className="flex items-center justify-between border-border-subtle border-b px-[18px] py-3 font-semibold text-sm text-strong">
        <span className="inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap [&_svg]:text-action-primary">
          <Plus size={16} /> Add a topic to SQL
        </span>
        <button
          aria-label="Close"
          className="inline-flex cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-1 text-muted-foreground hover:bg-muted hover:text-strong"
          onClick={onClose}
          type="button"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-0" data-variant="inline">
        <div className="mx-auto w-full max-w-[720px] px-[22px] pt-4 pb-1">
          <span className="font-semibold text-action-primary text-xs uppercase tracking-wider">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="mt-1 mb-2 block font-display font-semibold text-base text-strong">{STEPS[step]}</span>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-action-primary transition-[width] duration-[220ms] ease-out"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="mx-auto min-h-0 w-full max-w-[720px] flex-1 overflow-y-auto px-[22px] py-4">
          {step === 0 && (
            <div>
              <p className="mt-0 mr-0 mb-[14px] ml-0 text-muted-foreground text-sm leading-normal [&_code]:font-mono">
                Pick a Redpanda topic to expose as a SQL table. Tables are created in{' '}
                <code>default_redpanda_catalog</code> — the catalog for Redpanda topics.
              </p>
              <Input
                className="mb-3"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search topics"
                value={search}
              />
              <div className="flex flex-col gap-2">
                {visibleTopics.map((t) => (
                  <button
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-[14px] py-3 text-left font-sans',
                      'hover:border-border-strong hover:bg-muted',
                      'data-[selected]:border-2 data-[selected]:border-secondary data-[selected]:px-[13px] data-[selected]:py-[11px]'
                    )}
                    data-selected={topic === t.name || undefined}
                    key={t.name}
                    onClick={() => pickTopic(t)}
                    type="button"
                  >
                    <span
                      className={cn(
                        'inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-input',
                        topic === t.name && 'border-secondary'
                      )}
                    >
                      {topic === t.name && <span className="h-[9px] w-[9px] rounded-full bg-secondary" />}
                    </span>
                    <Layers className="flex-shrink-0 text-action-primary" size={15} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-mono font-semibold text-sm text-strong">{t.name}</span>
                      <span className="mt-px text-muted-foreground text-xs">
                        {typeof t.partitions === 'number' ? `${t.partitions} partitions` : 'topic'}
                        {t.format ? ` · ${t.format}` : ''}
                      </span>
                    </span>
                    {t.iceberg && (
                      <span
                        className="inline-flex flex-shrink-0 items-center gap-[3px] rounded-full bg-info-subtle px-[7px] py-0.5 font-semibold text-caption-sm text-info [&_svg]:text-current"
                        title="Iceberg tiering enabled"
                      >
                        <GitMerge size={11} />
                        Iceberg
                      </span>
                    )}
                  </button>
                ))}
                {visibleTopics.length === 0 && (
                  <div className="text-muted-foreground text-sm leading-normal">No topics found.</div>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="mb-4">
                <span className="mb-1.5 block font-semibold text-sm text-strong">Catalog</span>
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-[9px] font-mono text-sm text-strong [&_svg]:text-muted-foreground">
                  <Layers size={14} /> default_redpanda_catalog{' '}
                  <span className="ml-auto font-sans text-muted-foreground text-xs">fixed for Redpanda topics</span>
                </div>
              </div>
              <div className="mb-4">
                <span className="mb-1.5 block font-semibold text-sm text-strong">Source topic</span>
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-[9px] font-mono text-sm text-strong [&_svg]:text-muted-foreground">
                  <GitBranch size={14} /> {topic}
                  {chosen?.iceberg && (
                    <span className="ml-auto inline-flex items-center gap-1 font-sans text-info text-xs [&_svg]:text-current">
                      <GitMerge size={11} /> Iceberg-tiered
                    </span>
                  )}
                </div>
              </div>
              {chosen?.iceberg && (
                <div className="mb-4 flex items-start gap-[9px] rounded-md border border-info bg-info-subtle px-[13px] py-[11px] text-foreground text-xs leading-normal [&_code]:font-mono [&_svg]:mt-px [&_svg]:flex-shrink-0 [&_svg]:text-info">
                  <GitMerge size={15} />
                  <span>
                    This topic is Iceberg-tiered. Queries are <strong>bridged</strong> automatically — Redpanda meshes
                    the live topic with its Iceberg table so results stay realtime despite the flush lag.
                  </span>
                </div>
              )}
              <div className="mb-4">
                <label className="mb-1.5 block font-semibold text-sm text-strong" htmlFor="wz-table-name">
                  Table name
                </label>
                <Input
                  className={cn(nameError && 'border-destructive')}
                  id="wz-table-name"
                  onBlur={() => setTouched(true)}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="cars"
                  value={name}
                />
                {nameError ? (
                  <span className="mt-1.5 block text-destructive text-xs">
                    Use lowercase letters, numbers and underscores; must start with a letter or underscore.
                  </span>
                ) : (
                  <span className="mt-1.5 block text-muted-foreground text-xs">
                    How the table appears in the catalog and your queries.
                  </span>
                )}
              </div>
              <div className="mb-4">
                <span className="mb-1.5 block font-semibold text-sm text-strong">This will run</span>
                <DynamicCodeBlock code={createSQL(tableName, topic ?? '')} lang="sql" />
              </div>
              {error && <div className="mt-1.5 block text-destructive text-xs">{error}</div>}
            </div>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-[720px] flex-shrink-0 items-center justify-between border-border-subtle border-t px-[22px] py-[14px]">
          <Button onClick={onClose} size="md" variant="secondary-ghost">
            Cancel
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button disabled={isCreating} onClick={() => setStep(0)} size="md" variant="secondary-outline">
                Back
              </Button>
            )}
            {step === 0 ? (
              <Button disabled={!topic} onClick={next} size="md" variant="primary">
                Continue
              </Button>
            ) : (
              <Button disabled={isCreating} onClick={finish} size="md" variant="primary">
                <Plus size={15} /> {isCreating ? 'Creating…' : 'Create table'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
