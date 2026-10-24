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

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Choicebox,
  ChoiceboxItem,
  ChoiceboxItemContent,
  ChoiceboxItemHeader,
  ChoiceboxItemIndicator,
  ChoiceboxItemSubtitle,
  ChoiceboxItemTitle,
} from 'components/redpanda-ui/components/choicebox';
import { SyncCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Progress } from 'components/redpanda-ui/components/progress';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { GitBranch, GitMerge, Layers, Plus, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Controller, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { TonedIcon } from '../shared/toned-icon';

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

const CATALOG_NAME = 'default_redpanda_catalog';
const STEPS = ['Choose a topic', 'Name the table'] as const;
const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

const formSchema = z.object({
  tableName: z
    .string()
    .min(1, 'Table name is required.')
    .regex(TABLE_NAME_RE, 'Use lowercase letters, numbers and underscores; must start with a letter or underscore.'),
});

type FormValues = z.infer<typeof formSchema>;

/** Turn a topic name into a valid default table name (topic names may contain dots or dashes). */
function suggestTableName(topicName: string): string {
  const slug = topicName.toLowerCase().replaceAll(/[^a-z0-9_]/g, '_');
  return TABLE_NAME_RE.test(slug) ? slug : `_${slug}`;
}

export function createTableSql(tableName: string, topic: string): string {
  return `CREATE TABLE ${CATALOG_NAME}=>${tableName || 'my_table'}\n  WITH (topic='${topic}');`;
}

function describeTopic(topic: WizardTopic): string {
  const partitions = typeof topic.partitions === 'number' ? `${topic.partitions} partitions` : 'topic';
  return topic.format ? `${partitions} · ${topic.format}` : partitions;
}

export function SqlWizard({ topics, onClose, onCreate, isCreating, error }: SqlWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState<WizardTopic | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: { tableName: '' },
  });

  const selectTopic = (topicName: string) => {
    const topic = topics.find((t) => t.name === topicName);
    if (!topic) {
      return;
    }
    // Prefill the table name unless the user already typed their own.
    const currentName = form.getValues('tableName');
    if (!currentName || (selectedTopic && currentName === suggestTableName(selectedTopic.name))) {
      form.setValue('tableName', suggestTableName(topic.name));
    }
    setSelectedTopic(topic);
  };

  const submit = form.handleSubmit(({ tableName }) => {
    if (selectedTopic) {
      onCreate({ topic: selectedTopic.name, tableName });
    }
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <span className="inline-flex items-center gap-2 text-body font-semibold text-strong [&_svg]:text-action-primary">
          <Plus size={16} /> Add a topic to SQL
        </span>
        <Button aria-label="Close" onClick={onClose} size="icon-sm" variant="ghost">
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[720px] px-6 pt-4 pb-1">
          <span className="text-body-sm font-semibold tracking-wider text-action-primary uppercase">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="mt-1 mb-2 block text-heading-sm font-semibold text-strong">{STEPS[step]}</span>
          <Progress className="h-1" value={((step + 1) / STEPS.length) * 100} />
        </div>

        <div className="mx-auto min-h-0 w-full max-w-[720px] flex-1 overflow-y-auto px-6 py-4">
          {step === 0 || !selectedTopic ? (
            <TopicStep onSelect={selectTopic} selectedTopicName={selectedTopic?.name} topics={topics} />
          ) : (
            <TableNameStep error={error} form={form} topic={selectedTopic} />
          )}
        </div>

        <footer className="mx-auto flex w-full max-w-[720px] shrink-0 items-center justify-between border-t px-6 py-3.5">
          <Button onClick={onClose} size="md" variant="ghost">
            Cancel
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button disabled={isCreating} onClick={() => setStep(0)} size="md" variant="outline">
                Back
              </Button>
            )}
            {step === 0 ? (
              <Button disabled={!selectedTopic} onClick={() => setStep(1)} size="md" variant="primary">
                Continue
              </Button>
            ) : (
              <Button isLoading={isCreating} onClick={submit} size="md" variant="primary">
                <Plus size={15} /> Create table
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

type TopicStepProps = {
  topics: WizardTopic[];
  selectedTopicName: string | undefined;
  onSelect: (topicName: string) => void;
};

function TopicStep({ topics, selectedTopicName, onSelect }: TopicStepProps) {
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visibleTopics = query ? topics.filter((t) => t.name.toLowerCase().includes(query)) : topics;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-body text-muted-foreground">
        Pick a Redpanda topic to expose as a SQL table. Tables are created in <InlineCode>{CATALOG_NAME}</InlineCode> —
        the catalog for Redpanda topics.
      </div>
      <Input onChange={(e) => setSearch(e.target.value)} placeholder="Search topics" value={search} />
      {visibleTopics.length === 0 ? (
        <div className="text-body text-muted-foreground">No topics found.</div>
      ) : (
        <Choicebox
          aria-label="Topics"
          onValueChange={(value) => onSelect(value as string)}
          value={selectedTopicName ?? ''}
        >
          <div className="grid gap-2">
            {visibleTopics.map((topic) => (
              <ChoiceboxItem className="items-center" key={topic.name} size="full" value={topic.name}>
                <ChoiceboxItemContent>
                  <ChoiceboxItemIndicator />
                </ChoiceboxItemContent>
                <ChoiceboxItemHeader>
                  <ChoiceboxItemTitle>
                    <span className="flex items-center gap-2 font-mono text-body">
                      <TonedIcon className="shrink-0" icon={Layers} size={15} tone="action" />
                      {topic.name}
                    </span>
                  </ChoiceboxItemTitle>
                  <ChoiceboxItemSubtitle>{describeTopic(topic)}</ChoiceboxItemSubtitle>
                </ChoiceboxItemHeader>
                {topic.iceberg ? <IcebergBadge /> : null}
              </ChoiceboxItem>
            ))}
          </div>
        </Choicebox>
      )}
    </div>
  );
}

type TableNameStepProps = {
  topic: WizardTopic;
  form: UseFormReturn<FormValues>;
  error?: string;
};

function TableNameStep({ topic, form, error }: TableNameStepProps) {
  const tableName = useWatch({ control: form.control, name: 'tableName' });
  const previewLabelId = useId();

  return (
    <div className="flex flex-col gap-4">
      <SummaryRow label="Catalog">
        <Layers size={14} /> {CATALOG_NAME}
        <span className="ml-auto font-sans text-body-sm text-muted-foreground">fixed for Redpanda topics</span>
      </SummaryRow>

      <SummaryRow label="Source topic">
        <GitBranch size={14} /> {topic.name}
        {topic.iceberg ? (
          <span className="ml-auto">
            <IcebergBadge />
          </span>
        ) : null}
      </SummaryRow>

      {topic.iceberg ? (
        <Alert icon={<GitMerge size={15} />}>
          <AlertDescription>
            This topic is Iceberg-tiered. Queries are <strong>bridged</strong> automatically — Redpanda meshes the live
            topic with its Iceberg table so results stay realtime despite the flush lag.
          </AlertDescription>
        </Alert>
      ) : null}

      <Controller
        control={form.control}
        name="tableName"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="sql-wizard-table-name">Table name</FieldLabel>
            <Input {...field} aria-invalid={fieldState.invalid} id="sql-wizard-table-name" placeholder="cars" />
            <FieldDescription>How the table appears in the catalog and your queries.</FieldDescription>
            {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <figure aria-labelledby={previewLabelId} className="flex flex-col gap-1.5">
        <FieldTitle id={previewLabelId}>
          <span className="text-strong">This will run</span>
        </FieldTitle>
        <SyncCodeBlock className="my-0" code={createTableSql(tableName, topic.name)} keepBackground lang="sql" />
      </figure>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <dl className="flex flex-col gap-1.5">
      <dt>
        <FieldTitle>
          <span className="text-strong">{label}</span>
        </FieldTitle>
      </dt>
      <dd className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-mono text-body text-strong [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
        {children}
      </dd>
    </dl>
  );
}

function IcebergBadge() {
  return (
    <Badge size="sm" title="Iceberg tiering enabled" tone="informative" variant="subtle">
      <GitMerge size={11} />
      Iceberg
    </Badge>
  );
}
