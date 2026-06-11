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
import { cn } from 'components/redpanda-ui/lib/utils';
import { FileText, History, Play, Plus, Terminal, Wand2, X } from 'lucide-react';
import {
  forwardRef,
  type MouseEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { formatSQL } from './sql';
import type { SqlIdentifier, SqlRole } from './sql-types';

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

const SQL_THEME_LIGHT = 'rp-sql-light';
const SQL_THEME_DARK = 'rp-sql-dark';

// Tracks the registry `.dark` class on the document root so the Monaco editor
// (not a Tailwind component) switches theme in lockstep with the rest of the
// surface. Uses useSyncExternalStore — no effect — per project style.
function subscribeToColorMode(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getIsDarkSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribeToColorMode, getIsDarkSnapshot, () => false);
}

// Monaco's defineTheme only accepts #RRGGBB / #RRGGBBAA. CSS custom properties
// can resolve to shorthand (#000), so expand to a full hex before handing it to
// Monaco; otherwise it throws "Illegal value for token color".
const SHORT_HEX_RE = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i;
const FULL_HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
function toMonacoHex(value: string, fallback: string): string {
  const v = value.trim();
  const short = SHORT_HEX_RE.exec(v);
  if (short) {
    const [, r, g, b, a] = short;
    return `#${r}${r}${g}${g}${b}${b}${a ? `${a}${a}` : ''}`;
  }
  return FULL_HEX_RE.test(v) ? v : fallback;
}

// Resolve a registry color scale (e.g. --color-purple-300) to the bare
// `rrggbb` Monaco wants for token rule foregrounds (no leading #).
function ruleColor(css: CSSStyleDeclaration, name: string, fallback: string): string {
  return toMonacoHex(css.getPropertyValue(name), fallback).replace('#', '').slice(0, 6);
}

// SQL syntax palette, mapped from the design's `.sql-*` token classes. Monaco's
// SQL grammar emits `keyword`, `predefined` (built-in functions), `string`,
// `number`, `comment`, `operator`, `delimiter` and `identifier` token types.
function sqlTokenRules(css: CSSStyleDeclaration, mode: 'light' | 'dark') {
  const c =
    mode === 'dark'
      ? {
          keyword: ruleColor(css, '--color-purple-300', '#d6bbfb'),
          fn: ruleColor(css, '--color-indigo-300', '#a4bcfd'),
          str: ruleColor(css, '--color-green-300', '#68d391'),
          num: ruleColor(css, '--color-orange-300', '#faaf7b'),
          comment: ruleColor(css, '--color-grey-400', '#919295'),
          punct: ruleColor(css, '--color-grey-500', '#79797d'),
          id: ruleColor(css, '--color-grey-100', '#dcdcde'),
        }
      : {
          keyword: ruleColor(css, '--color-purple-700', '#6941c6'),
          fn: ruleColor(css, '--color-indigo-600', '#444ce7'),
          str: ruleColor(css, '--color-green-700', '#276749'),
          num: ruleColor(css, '--color-orange-700', '#f77923'),
          comment: ruleColor(css, '--color-grey-600', '#606164'),
          punct: ruleColor(css, '--color-grey-500', '#79797d'),
          id: ruleColor(css, '--color-grey-900', '#181818'),
        };
  return [
    { token: 'keyword', foreground: c.keyword, fontStyle: 'bold' },
    { token: 'predefined', foreground: c.fn },
    { token: 'string', foreground: c.str },
    { token: 'number', foreground: c.num },
    { token: 'comment', foreground: c.comment, fontStyle: 'italic' },
    { token: 'operator', foreground: c.punct },
    { token: 'delimiter', foreground: c.punct },
    { token: 'identifier', foreground: c.id },
  ];
}

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
  const isDark = useIsDarkMode();

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
    const css = getComputedStyle(document.documentElement);

    // Light: transparent surface so the editor shows the (light) container, with
    // the design's syntax palette and muted gutter line numbers.
    monaco.editor.defineTheme(SQL_THEME_LIGHT, {
      base: 'vs',
      inherit: true,
      rules: sqlTokenRules(css, 'light'),
      colors: {
        'editor.background': '#00000000',
        'editorGutter.background': '#00000000',
        'editorLineNumber.foreground': toMonacoHex(css.getPropertyValue('--color-grey-400'), '#919295'),
        'editorLineNumber.activeForeground': toMonacoHex(css.getPropertyValue('--color-grey-600'), '#606164'),
      },
    });
    // Dark: vs-dark's default surface (#1e1e1e) and blue token palette don't
    // match the design. Keep the editor + gutter transparent (like the light
    // theme) so the surrounding `bg-background` container shows through and the
    // editor always matches the page surface — `--color-background` can't be
    // resolved here because beforeMount may run while the document is still in
    // light mode, which would bake the wrong (light) value into the dark theme.
    // Token foregrounds use theme-invariant color scales, so they're safe.
    monaco.editor.defineTheme(SQL_THEME_DARK, {
      base: 'vs-dark',
      inherit: true,
      rules: sqlTokenRules(css, 'dark'),
      colors: {
        'editor.background': '#00000000',
        'editorGutter.background': '#00000000',
        'editor.foreground': toMonacoHex(css.getPropertyValue('--color-grey-100'), '#dcdcde'),
        'editorLineNumber.foreground': toMonacoHex(css.getPropertyValue('--color-grey-600'), '#606164'),
        'editorLineNumber.activeForeground': toMonacoHex(css.getPropertyValue('--color-grey-400'), '#919295'),
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
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b pr-[10px]">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {tabs.map((t) => (
            <div
              className={cn(
                'relative flex items-center gap-1 whitespace-nowrap border-border-subtle border-r pr-[10px] pl-[14px] text-muted-foreground text-xs',
                'hover:bg-muted hover:text-strong [&_svg]:text-muted-foreground',
                'data-[active]:bg-background data-[active]:font-semibold data-[active]:text-strong',
                "data-[active]:after:absolute data-[active]:after:inset-x-0 data-[active]:after:-bottom-px data-[active]:after:h-0.5 data-[active]:after:bg-action-primary data-[active]:after:content-['']"
              )}
              data-active={t.id === activeId || undefined}
              key={t.id}
            >
              <button
                className="flex cursor-pointer items-center gap-[7px] whitespace-nowrap border-0 bg-transparent py-[9px] text-inherit"
                onClick={() => setActiveId(t.id)}
                type="button"
              >
                <FileText size={13} />
                <span>{t.name}</span>
              </button>
              <button
                aria-label={`Close ${t.name}`}
                className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-strong"
                onClick={(e) => closeTab(t.id, e)}
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="inline-flex w-[30px] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-muted-foreground hover:text-strong"
            onClick={addTab}
            title="New query"
            type="button"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 py-[7px]">
          <div className="relative inline-flex items-center">
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
                  className="fixed inset-0 z-30 cursor-default border-0 bg-transparent"
                  onClick={() => setHistOpen(false)}
                  type="button"
                />
                <div className="absolute top-[calc(100%+6px)] right-0 z-[31] max-h-[360px] w-[360px] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                  <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Recent queries · this browser
                  </div>
                  {history.length === 0 ? (
                    <div className="p-2.5 text-muted-foreground text-sm">No queries yet</div>
                  ) : null}
                  {history.map((h, i) => (
                    <button
                      className="flex w-full cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-1.5 text-left text-strong text-xs hover:bg-accent-subtle [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                      key={`${h.at}-${i}`}
                      onClick={() => {
                        updateSql(h.sql);
                        setHistOpen(false);
                      }}
                      type="button"
                    >
                      <Terminal size={14} />
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                        {h.sql.replace(/\s+/g, ' ').slice(0, 60)}
                      </span>
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
          <div className="flex items-center gap-1.5">
            <Button disabled={!hasSel} onClick={runSelection} size="sm" variant="secondary-outline">
              Run selection
            </Button>
            <Button
              className="!bg-surface-primary !text-white hover:!bg-surface-primary-hover"
              onClick={doRun}
              size="sm"
              variant="primary"
            >
              <Play size={14} /> Run
              <span className="ml-0.5 inline-flex gap-0.5">
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-sm bg-white/[0.18] px-1 py-px font-mono font-semibold text-white text-xs leading-none">
                  ⌘
                </span>
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-sm bg-white/[0.18] px-1 py-px font-mono font-semibold text-white text-xs leading-none">
                  ↵
                </span>
              </span>
            </Button>
          </div>
        </div>
      </div>

      <div className="[&_.kowlEditor]:!rounded-none [&_.kowlEditor]:!border-0 flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background [&_.kowlEditor]:min-w-0">
        <KowlEditor
          beforeMount={handleBeforeMount}
          height="100%"
          language="sql"
          onChange={(value) => updateSql(value ?? '')}
          onMount={handleMount}
          options={EDITOR_OPTIONS}
          theme={isDark ? SQL_THEME_DARK : SQL_THEME_LIGHT}
          value={active.sql}
          width="100%"
        />
      </div>
    </div>
  );
});
