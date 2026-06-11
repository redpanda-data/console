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
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Text } from 'components/redpanda-ui/components/typography';
import { FileText, History, Play, Plus, Terminal, Wand2, X } from 'lucide-react';
import {
  forwardRef,
  type MouseEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { isMacOS } from 'utils/platform';

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

// Monaco language providers are global per language, not per editor, so they
// are registered once for the app's lifetime and read the mounted editor's
// identifiers through this module-level slot (synced on every render below).
let activeIdentifiers: SqlIdentifier[] = [];
let sqlProvidersRegistered = false;

function registerSqlProviders(monaco: Monaco) {
  if (sqlProvidersRegistered) {
    return;
  }
  sqlProvidersRegistered = true;

  monaco.languages.registerCompletionItemProvider('sql', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions = activeIdentifiers.map((it) => ({
        label: it.label,
        kind: completionKind(monaco, it.kind),
        insertText: it.label,
        detail: it.kind,
        range,
      }));
      return { suggestions };
    },
  });

  // Back the editor's native Format Document action (Shift+Alt+F) with
  // sql-formatter (Monaco ships no SQL formatter), so formatting runs
  // through Monaco and preserves cursor + undo. Dynamically imported to
  // keep it out of the initial bundle; postgresql is the closest dialect
  // to Oxla.
  monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits: async (model) => {
      const { format } = await import('sql-formatter');
      try {
        return [
          {
            range: model.getFullModelRange(),
            text: format(model.getValue(), { language: 'postgresql', keywordCase: 'upper' }),
          },
        ];
      } catch {
        // Unparseable SQL (mid-edit) — leave the text untouched.
        return [];
      }
    },
  });
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
  // Latest run callback, bound into the Cmd/Ctrl+Enter command (registered once).
  const runRef = useRef<() => void>(() => undefined);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

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

  const updateSql = (sql: string) => {
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, sql } : t)));
  };

  const runText = (text: string, mode: RunMode) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const entry: HistoryEntry = { sql: trimmed, at: Date.now() };
    const nh = [entry, ...history.filter((h) => h.sql !== entry.sql)].slice(0, 40);
    setHistory(nh);
    saveHistory(nh);
    onRun(trimmed, mode);
  };

  // Run the current selection if any, else the whole tab.
  const doRun = () => {
    const editor = editorRef.current;
    const sel = editor?.getSelection();
    const model = editor?.getModel();
    if (editor && sel && model && !sel.isEmpty()) {
      runText(model.getValueInRange(sel), 'selection');
      return;
    }
    runText(active.sql, 'all');
  };

  // The Cmd/Ctrl+Enter command and the global completion provider are
  // registered once, so they read fresh state through this render-synced
  // ref/slot (the useLatest pattern — see react-best-practices rules).
  useLayoutEffect(() => {
    runRef.current = doRun;
    activeIdentifiers = identifiers;
  });

  const runSelection = () => {
    const editor = editorRef.current;
    const sel = editor?.getSelection();
    const model = editor?.getModel();
    if (editor && sel && model && !sel.isEmpty()) {
      runText(model.getValueInRange(sel), 'selection');
    }
  };

  const handleBeforeMount = (monaco: Monaco) => {
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
  };

  const handleMount = (editor: IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;

    editor.onDidChangeCursorSelection((e) => setHasSel(!e.selection.isEmpty()));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());

    registerSqlProviders(monaco);
  };

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
      <div className="flex shrink-0 items-stretch">
        <Tabs className="min-w-0 flex-1" onValueChange={(v) => setActiveId(Number(v))} value={String(active.id)}>
          <TabsList className="overflow-x-auto" variant="underline">
            {tabs.map((t) => (
              <TabsTrigger
                className="w-auto shrink-0 gap-1.5 px-3 text-xs"
                key={t.id}
                render={<div />}
                value={String(t.id)}
                variant="underline"
              >
                <FileText size={13} />
                <span>{t.name}</span>
                <Button
                  aria-label={`Close ${t.name}`}
                  onClick={(e) => closeTab(t.id, e)}
                  size="icon-xs"
                  variant="secondary-ghost"
                >
                  <X />
                </Button>
              </TabsTrigger>
            ))}
            <Button aria-label="New query" onClick={addTab} size="icon-sm" title="New query" variant="secondary-ghost">
              <Plus />
            </Button>
          </TabsList>
        </Tabs>
        <div className="flex shrink-0 items-center gap-1.5 border-b pr-2">
          <Popover onOpenChange={setHistOpen} open={histOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" title="Query history (this browser)" variant="secondary-ghost">
                <History /> History
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-96 w-96 overflow-y-auto p-1">
              <Text className="px-2 py-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Recent queries · this browser
              </Text>
              {history.length === 0 ? <Text className="p-2 text-muted-foreground text-sm">No queries yet</Text> : null}
              {history.map((h, i) => (
                <Button
                  className="w-full justify-start"
                  key={`${h.at}-${i}`}
                  onClick={() => {
                    updateSql(h.sql);
                    setHistOpen(false);
                  }}
                  size="sm"
                  variant="secondary-ghost"
                >
                  <Terminal />
                  <span className="truncate font-mono">{h.sql.replace(/\s+/g, ' ').slice(0, 60)}</span>
                </Button>
              ))}
            </PopoverContent>
          </Popover>
          <Button
            onClick={() => void editorRef.current?.getAction('editor.action.formatDocument')?.run()}
            size="sm"
            title="Format SQL"
            variant="secondary-ghost"
          >
            <Wand2 /> Format
          </Button>
          <Button disabled={!hasSel} onClick={runSelection} size="sm" variant="secondary-outline">
            Run selection
          </Button>
          <Button onClick={doRun} size="sm" variant="secondary">
            <Play /> Run
            <KbdGroup>
              <Kbd size="xs">{isMacOS() ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd size="xs">↵</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
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
          wrapperProps={{ className: 'min-w-0 flex-1' }}
        />
      </div>
    </div>
  );
});
