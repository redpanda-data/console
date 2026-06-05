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

import KowlEditor, { type IStandaloneCodeEditor, type Monaco } from 'components/misc/kowl-editor';
import { Button } from 'components/redpanda-ui/components/button';
import { FileText, History, Play, Plus, Terminal, Wand2, X } from 'lucide-react';
import { forwardRef, type MouseEvent, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import './sql-editor.css';
import type { SqlIdentifier, SqlRole } from './sql-types';
import { formatSQL } from './sql';

// Imperative handle exposed to the workspace so the catalog tree can open a
// query in a new editor tab (mirrors the prototype's editorRef).
export type SqlEditorHandle = {
  /** Open `sql` in a new tab named `name` (or "Query N") and focus it. */
  setQuery: (sql: string, name?: string) => void;
};

export type RunMode = 'all' | 'selection';

export type SqlEditorProps = {
  /** Run a statement. `mode` distinguishes whole-tab vs. selection runs. */
  onRun: (sql: string, mode: RunMode) => void;
  /** Autocomplete identifiers (catalog/table/column names + SQL keywords). */
  identifiers: SqlIdentifier[];
  /** Effective role; gates admin-only affordances. */
  role: SqlRole;
  /** SQL to seed the first tab with. */
  initialQuery?: string;
};

const HISTORY_KEY = 'rp_sql_history_v1';

type HistoryEntry = { sql: string; at: number };

function isHistoryEntry(v: unknown): v is HistoryEntry {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as HistoryEntry).sql === 'string' &&
    typeof (v as HistoryEntry).at === 'number'
  );
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isHistoryEntry) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    // best-effort; ignore quota/serialization failures
  }
}

type Tab = { id: number; name: string; sql: string };

const DEFAULT_QUERY =
  'SELECT vin, make, model, year, price_usd\nFROM default_redpanda_catalog.cars\nWHERE in_stock = true\nORDER BY price_usd DESC\nLIMIT 100;';

// Monaco editor options tuned to match the SQL Studio surface. KowlEditor merges
// these over its own defaults.
const EDITOR_OPTIONS = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  lineHeight: 21,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  tabSize: 2,
  insertSpaces: true,
  renderLineHighlight: 'line',
  automaticLayout: true,
  wordWrap: 'off',
  lineNumbersMinChars: 3,
  overviewRulerLanes: 0,
  fixedOverflowWidgets: true,
  scrollbar: { alwaysConsumeMouseWheel: false },
} as const;

const SQL_THEME = 'rp-sql-light';

// Maps our identifier kind to a Monaco completion-item kind (drives the glyph).
function completionKind(monaco: Monaco, kind: SqlIdentifier['kind']) {
  const K = monaco.languages.CompletionItemKind;
  switch (kind) {
    case 'catalog':
      return K.Module;
    case 'table':
      return K.Class;
    case 'column':
      return K.Field;
    default:
      return K.Keyword;
  }
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { onRun, identifiers, initialQuery },
  ref
) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, name: 'Query 1', sql: initialQuery ?? DEFAULT_QUERY }]);
  const [activeId, setActiveId] = useState(1);
  const nextId = useRef(2);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [histOpen, setHistOpen] = useState(false);
  const [hasSel, setHasSel] = useState(false);

  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  // Latest identifiers, read by the (once-registered) completion provider.
  const identifiersRef = useRef(identifiers);
  const completionDisposable = useRef<{ dispose: () => void } | null>(null);
  // Latest run callback, bound into the Cmd/Ctrl+Enter command (registered once).
  const runRef = useRef<() => void>(() => undefined);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  useEffect(() => {
    identifiersRef.current = identifiers;
  }, [identifiers]);

  // Dispose the completion provider when the editor unmounts.
  useEffect(() => () => completionDisposable.current?.dispose(), []);

  useImperativeHandle(
    ref,
    () => ({
      setQuery: (sql: string, name?: string) => {
        const id = nextId.current++;
        setTabs((prev) => [...prev, { id, name: name ?? `Query ${id}`, sql }]);
        setActiveId(id);
        requestAnimationFrame(() => editorRef.current?.focus());
      },
    }),
    []
  );

  const updateSql = useCallback(
    (sql: string) => {
      setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, sql } : t)));
    },
    [activeId]
  );

  const runText = useCallback(
    (text: string, mode: RunMode) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const entry: HistoryEntry = { sql: trimmed, at: Date.now() };
      const nh = [entry, ...history.filter((h) => h.sql !== entry.sql)].slice(0, 40);
      setHistory(nh);
      saveHistory(nh);
      onRun(trimmed, mode);
    },
    [history, onRun]
  );

  // Run the current selection if any, else the whole tab.
  const doRun = useCallback(() => {
    const editor = editorRef.current;
    const sel = editor?.getSelection();
    const model = editor?.getModel();
    if (editor && sel && model && !sel.isEmpty()) {
      runText(model.getValueInRange(sel), 'selection');
      return;
    }
    runText(active.sql, 'all');
  }, [active.sql, runText]);

  useEffect(() => {
    runRef.current = doRun;
  }, [doRun]);

  const runSelection = useCallback(() => {
    const editor = editorRef.current;
    const sel = editor?.getSelection();
    const model = editor?.getModel();
    if (editor && sel && model && !sel.isEmpty()) {
      runText(model.getValueInRange(sel), 'selection');
    }
  }, [runText]);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    monaco.editor.defineTheme(SQL_THEME, {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#00000000',
        'editorGutter.background': '#00000000',
      },
    });
  }, []);

  const handleMount = useCallback((editor: IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;

    editor.onDidChangeCursorSelection((e) => setHasSel(!e.selection.isEmpty()));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());

    if (!completionDisposable.current) {
      completionDisposable.current = monaco.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          const suggestions = identifiersRef.current.map((it) => ({
            label: it.label,
            kind: completionKind(monaco, it.kind),
            insertText: it.label,
            detail: it.kind,
            range,
          }));
          return { suggestions };
        },
      });
    }
  }, []);

  const addTab = () => {
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id, name: `Query ${id}`, sql: '' }]);
    setActiveId(id);
  };

  const closeTab = (id: number, e: MouseEvent) => {
    e.stopPropagation();
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const nextTabs = prev.filter((t) => t.id !== id);
      if (nextTabs.length === 0) {
        const nid = nextId.current++;
        setActiveId(nid);
        return [{ id: nid, name: `Query ${nid}`, sql: '' }];
      }
      if (id === activeId) {
        setActiveId(nextTabs[Math.max(0, idx - 1)].id);
      }
      return nextTabs;
    });
  };

  return (
    <div className="ed">
      <div className="ed-tabs">
        <div className="ed-tabs-list">
          {tabs.map((t) => (
            <div className="ed-tab" data-active={t.id === activeId || undefined} key={t.id}>
              <button className="ed-tab-open" onClick={() => setActiveId(t.id)} type="button">
                <FileText size={13} />
                <span>{t.name}</span>
              </button>
              <button
                aria-label={`Close ${t.name}`}
                className="ed-tab-x"
                onClick={(e) => closeTab(t.id, e)}
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button className="ed-tab-add" onClick={addTab} title="New query" type="button">
            <Plus size={14} />
          </button>
        </div>
        <div className="ed-tabs-tools">
          <div className="ed-hist-wrap">
            <Button
              onClick={() => setHistOpen((v) => !v)}
              size="sm"
              title="Query history (this browser)"
              variant="secondary-ghost"
            >
              <History size={15} /> History
            </Button>
            {histOpen ? (
              <>
                <button
                  aria-label="Close history"
                  className="ed-hist-scrim"
                  onClick={() => setHistOpen(false)}
                  type="button"
                />
                <div className="ed-hist">
                  <div className="ed-hist-label">Recent queries · this browser</div>
                  {history.length === 0 ? <div className="ed-hist-empty">No queries yet</div> : null}
                  {history.map((h, i) => (
                    <button
                      className="ed-hist-item"
                      key={`${h.at}-${i}`}
                      onClick={() => {
                        updateSql(h.sql);
                        setHistOpen(false);
                      }}
                      type="button"
                    >
                      <Terminal size={14} />
                      <span className="ed-hist-sql">{h.sql.replace(/\s+/g, ' ').slice(0, 60)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <Button
            onClick={() => updateSql(formatSQL(active.sql))}
            size="sm"
            title="Format SQL"
            variant="secondary-ghost"
          >
            <Wand2 size={15} /> Format
          </Button>
          <div className="ed-run-group">
            <Button disabled={!hasSel} onClick={runSelection} size="sm" variant="secondary-outline">
              Run selection
            </Button>
            <Button onClick={doRun} size="sm" variant="primary">
              <Play size={14} /> Run
              <span className="ed-run-kbd">
                <span className="ed-kbd">⌘</span>
                <span className="ed-kbd">↵</span>
              </span>
            </Button>
          </div>
        </div>
      </div>

      <div className="ed-monaco">
        <KowlEditor
          beforeMount={handleBeforeMount}
          height="100%"
          language="sql"
          onChange={(value) => updateSql(value ?? '')}
          onMount={handleMount}
          options={EDITOR_OPTIONS}
          theme={SQL_THEME}
          value={active.sql}
          width="100%"
        />
      </div>
    </div>
  );
});
