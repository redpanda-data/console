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

import { config, isEmbedded } from 'config';
import { useCallback, useEffect, useState } from 'react';
import { uiState } from 'state/ui-state';

import { SqlLanding } from './sql-landing';
import { SqlWorkspace } from './sql-workspace';
import { useSqlCatalogs } from './use-sql-catalogs';

// The SQL route's two independent top-level views: a standalone landing/overview
// (default) and the query editor studio. They are separate experiences — the
// landing has no studio chrome, and the studio has its own header with a "back to
// overview" affordance. The active view is persisted per browser session.
type SqlView = 'landing' | 'editor';
const SQL_VIEW_KEY = 'rp-sql-view';
const readSqlView = (): SqlView =>
  (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SQL_VIEW_KEY) : null) === 'editor'
    ? 'editor'
    : 'landing';

// The registry's near-black dark theme renders borders at rgba(255,255,255,0.04)
// — effectively invisible. The SQL surfaces use visible grey dividers, so re-point
// the border tokens to the registry grey scale in dark mode only (light untouched).
const SQL_DARK_BORDERS =
  'dark:[--color-border-strong:var(--color-grey-800)] dark:[--color-border-subtle:var(--color-grey-600)] dark:[--color-border:var(--color-grey-700)]';

// Standalone console renders its own breadcrumb/title header for the SQL route;
// populate it the way other pages do (no-op visually when embedded).
function useSqlPageHeader() {
  useEffect(() => {
    uiState.pageTitle = 'SQL';
    uiState.pageBreadcrumbs = [{ title: 'SQL', linkTo: '/sql', heading: 'SQL' }];
  }, []);
}

// Landing view: self-fetches catalog + identity data. The studio is unmounted
// while the landing is shown, so there is no duplicate fetch.
function SqlLandingView({
  onOpenEditor,
  onRunQuery,
  onAddTopic,
}: {
  onOpenEditor: () => void;
  onRunQuery: (sql: string) => void;
  onAddTopic: () => void;
}) {
  const { isLoading, sqlRole, completionCatalogs, hasTables } = useSqlCatalogs();
  return (
    <SqlLanding
      catalogs={completionCatalogs}
      clusterName={isEmbedded() ? config.clusterId : undefined}
      hasTables={hasTables}
      isLoading={isLoading}
      onAddTopic={onAddTopic}
      onOpenEditor={onOpenEditor}
      onRunQuery={onRunQuery}
      sqlRole={sqlRole}
    />
  );
}

export function SqlPage() {
  useSqlPageHeader();
  const [view, setViewState] = useState<SqlView>(readSqlView);
  // Editor entry intent: which query to seed (and whether to run it), and whether
  // to open the add-topic wizard. Read by the studio on its fresh mount.
  const [seedQuery, setSeedQuery] = useState('');
  const [autoRun, setAutoRun] = useState(false);
  const [openWizard, setOpenWizard] = useState(false);

  const setView = useCallback((next: SqlView) => {
    setViewState(next);
    try {
      sessionStorage.setItem(SQL_VIEW_KEY, next);
    } catch {
      // ignore storage failures (private mode / quota)
    }
  }, []);

  const onOpenEditor = useCallback(() => {
    setAutoRun(false);
    setOpenWizard(false);
    setView('editor');
  }, [setView]);

  const onRunQuery = useCallback(
    (sql: string) => {
      setSeedQuery(sql);
      setAutoRun(true);
      setOpenWizard(false);
      setView('editor');
    },
    [setView]
  );

  const onAddTopic = useCallback(() => {
    setAutoRun(false);
    setOpenWizard(true);
    setView('editor');
  }, [setView]);

  const onBack = useCallback(() => {
    setOpenWizard(false);
    setAutoRun(false);
    setView('landing');
  }, [setView]);

  if (view === 'editor') {
    return <SqlWorkspace autoRun={autoRun} onBack={onBack} openWizardOnMount={openWizard} seedQuery={seedQuery} />;
  }

  return (
    <div className={`flex h-full flex-col bg-background text-strong ${SQL_DARK_BORDERS}`}>
      <SqlLandingView onAddTopic={onAddTopic} onOpenEditor={onOpenEditor} onRunQuery={onRunQuery} />
    </div>
  );
}
