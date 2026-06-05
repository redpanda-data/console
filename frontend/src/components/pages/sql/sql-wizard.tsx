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
import { Input } from 'components/redpanda-ui/components/input';
import { GitBranch, GitMerge, Layers, Plus, X } from 'lucide-react';
import { useState } from 'react';

import './sql-wizard.css';
import { highlightSQL } from './sql';

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
    <div className="wz-inline">
      <div className="wz-inline-head">
        <span>
          <Plus size={16} /> Add a topic to SQL
        </span>
        <button aria-label="Close" className="wz-head-close" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>

      <div className="wz-body" data-variant="inline">
        <div className="wz-progress">
          <span className="wz-step-label">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="wz-step-name">{STEPS[step]}</span>
          <div className="wz-progress-bar">
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <div className="wz-content">
          {step === 0 && (
            <div className="wz-pane">
              <p className="wz-help">
                Pick a Redpanda topic to expose as a SQL table. Tables are created in{' '}
                <code>default_redpanda_catalog</code> — the catalog for Redpanda topics.
              </p>
              <Input
                className="wz-search"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search topics"
                value={search}
              />
              <div className="wz-topics">
                {visibleTopics.map((t) => (
                  <button
                    className="wz-topic"
                    data-selected={topic === t.name || undefined}
                    key={t.name}
                    onClick={() => pickTopic(t)}
                    type="button"
                  >
                    <span className="wz-topic-radio">{topic === t.name && <span />}</span>
                    <Layers className="wz-topic-ico" size={15} />
                    <span className="wz-topic-main">
                      <span className="wz-topic-name">{t.name}</span>
                      <span className="wz-topic-meta">
                        {typeof t.partitions === 'number' ? `${t.partitions} partitions` : 'topic'}
                        {t.format ? ` · ${t.format}` : ''}
                      </span>
                    </span>
                    {t.iceberg && (
                      <span className="wz-topic-ice" title="Iceberg tiering enabled">
                        <GitMerge size={11} />
                        Iceberg
                      </span>
                    )}
                  </button>
                ))}
                {visibleTopics.length === 0 && <div className="wz-help">No topics found.</div>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="wz-pane">
              <div className="wz-field">
                <span className="wz-field-label">Catalog</span>
                <div className="wz-readonly">
                  <Layers size={14} /> default_redpanda_catalog{' '}
                  <span className="wz-readonly-tag">fixed for Redpanda topics</span>
                </div>
              </div>
              <div className="wz-field">
                <span className="wz-field-label">Source topic</span>
                <div className="wz-readonly">
                  <GitBranch size={14} /> {topic}
                  {chosen?.iceberg && (
                    <span className="wz-readonly-tag wz-readonly-ice">
                      <GitMerge size={11} /> Iceberg-tiered
                    </span>
                  )}
                </div>
              </div>
              {chosen?.iceberg && (
                <div className="wz-bridge-note">
                  <GitMerge size={15} />
                  <span>
                    This topic is Iceberg-tiered. Queries are <strong>bridged</strong> automatically — Redpanda meshes
                    the live topic with its Iceberg table so results stay realtime despite the flush lag.
                  </span>
                </div>
              )}
              <div className="wz-field">
                <label className="wz-field-label" htmlFor="wz-table-name">
                  Table name
                </label>
                <Input
                  id="wz-table-name"
                  onBlur={() => setTouched(true)}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="cars"
                  style={nameError ? { borderColor: 'var(--color-destructive)' } : undefined}
                  value={name}
                />
                {nameError ? (
                  <span className="wz-field-err">
                    Use lowercase letters, numbers and underscores; must start with a letter or underscore.
                  </span>
                ) : (
                  <span className="wz-field-help">How the table appears in the catalog and your queries.</span>
                )}
              </div>
              <div className="wz-field">
                <span className="wz-field-label">This will run</span>
                <div className="wz-sql">
                  <pre
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: highlightSQL HTML-escapes all token text
                    dangerouslySetInnerHTML={{ __html: highlightSQL(createSQL(tableName, topic ?? '')) }}
                  />
                </div>
              </div>
              {error && <div className="wz-field-err">{error}</div>}
            </div>
          )}
        </div>

        <div className="wz-foot">
          <Button onClick={onClose} size="md" variant="secondary-ghost">
            Cancel
          </Button>
          <div className="wz-foot-right">
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
