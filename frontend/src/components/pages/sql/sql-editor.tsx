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

import {
  acceptCompletion,
  type CompletionContext,
  type CompletionResult,
  startCompletion,
} from '@codemirror/autocomplete';
import { PostgreSQL, type SQLNamespace, sql } from '@codemirror/lang-sql';
import { HighlightStyle, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { EditorState, type Extension, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
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
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { isMacOS } from 'utils/platform';
import { z } from 'zod';

import type { Catalog, SqlRole, TableRef } from './sql-types';

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
  /** Loaded catalog tree; drives schema-aware autocomplete. */
  catalogs: Catalog[];
  /** Effective role; gates admin-only affordances. */
  role: SqlRole;
  /** SQL to seed the first tab with. */
  initialQuery?: string;
};

const HISTORY_KEY = 'rp_sql_history_v1';

const HistoryEntrySchema = z.object({ sql: z.string(), at: z.number() });

type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

function loadHistory(): HistoryEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((entry) => {
      const parsed = HistoryEntrySchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
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
  'SELECT vin, make, model, year, price_usd\nFROM default_redpanda_catalog=>cars\nWHERE in_stock = true\nORDER BY price_usd DESC\nLIMIT 100;';

// Tracks the registry `.dark` class on the document root so the editor (whose
// highlight palette is built from theme-invariant color scales, not Tailwind
// classes) switches theme in lockstep with the rest of the surface. Uses
// useSyncExternalStore — no effect — per project style.
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

// Editor chrome tuned to match the SQL Studio surface: transparent editor and
// gutter so the surrounding `bg-background` container shows through, with
// muted gutter line numbers. CodeMirror themes are plain CSS, so registry
// custom properties can be referenced directly and stay live.
function editorChrome(mode: 'light' | 'dark'): Extension {
  const gutter = mode === 'dark' ? 'var(--color-grey-600)' : 'var(--color-grey-400)';
  const gutterActive = mode === 'dark' ? 'var(--color-grey-400)' : 'var(--color-grey-600)';
  return EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', height: '100%', fontSize: '13px' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
        lineHeight: '21px',
      },
      '.cm-content': { padding: '12px 0' },
      '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: gutter },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: gutterActive },
      '.cm-activeLine': {
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
      },
    },
    { dark: mode === 'dark' }
  );
}

// SQL syntax palette, mapped from the design's `.sql-*` token classes onto the
// Lezer highlight tags the SQL grammar emits (keywords, built-ins, strings,
// numbers, comments, operators/punctuation and identifiers).
function sqlHighlight(mode: 'light' | 'dark'): Extension {
  const c =
    mode === 'dark'
      ? {
          keyword: 'var(--color-purple-300)',
          fn: 'var(--color-indigo-300)',
          str: 'var(--color-green-300)',
          num: 'var(--color-orange-300)',
          comment: 'var(--color-grey-400)',
          punct: 'var(--color-grey-500)',
          id: 'var(--color-grey-100)',
        }
      : {
          keyword: 'var(--color-purple-700)',
          fn: 'var(--color-indigo-600)',
          str: 'var(--color-green-700)',
          num: 'var(--color-orange-700)',
          comment: 'var(--color-grey-600)',
          punct: 'var(--color-grey-500)',
          id: 'var(--color-grey-900)',
        };
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: c.keyword, fontWeight: 'bold' },
      { tag: [tags.standard(tags.name), tags.function(tags.variableName), tags.typeName], color: c.fn },
      { tag: [tags.string, tags.special(tags.string)], color: c.str },
      { tag: tags.number, color: c.num },
      { tag: tags.comment, color: c.comment, fontStyle: 'italic' },
      {
        tag: [tags.operator, tags.punctuation, tags.separator, tags.paren, tags.brace, tags.squareBracket],
        color: c.punct,
      },
      { tag: tags.name, color: c.id },
    ])
  );
}

const LIGHT_THEME: Extension = [editorChrome('light'), sqlHighlight('light')];
const DARK_THEME: Extension = [editorChrome('dark'), sqlHighlight('dark')];

function tableNamespace(table: TableRef): SQLNamespace {
  return {
    self: { label: table.name, type: 'class' },
    children: (table.columns ?? []).map((col) => ({ label: col.name, type: 'property', detail: col.short })),
  };
}

// Builds the lang-sql completion schema from the loaded catalog tree: bare
// table names → columns. Tables are deliberately NOT nested under their
// catalog — Redpanda SQL (Oxla) addresses catalog tables with arrow notation
// (`catalog=>table`), which catalogArrowSource below handles; dot-style
// nesting would advertise syntax the server rejects. Bare entries still give
// alias/column resolution (`FROM default_redpanda_catalog=>cars c` → `c.`).
function buildSchema(catalogs: Catalog[]): SQLNamespace {
  const root: Record<string, SQLNamespace> = {};
  for (const catalog of catalogs) {
    for (const ns of catalog.namespaces) {
      for (const table of ns.tables) {
        if (!(table.name in root)) {
          root[table.name] = tableNamespace(table);
        }
      }
    }
  }
  return root;
}

// Matches an identifier followed by `=>` or `.` and a partial table name,
// anchored at the cursor: [, name, gap1, separator, gap2, quote, partial].
const CATALOG_REF_RE = /([A-Za-z_][\w$]*)(\s*)(=>|\.)(\s*)("?)([\w$]*)$/;

// Completion source for Redpanda SQL's catalog arrow notation. The generic
// schema completion can't model `catalog=>table`, so this source:
// - offers catalog names (boosted right after FROM/JOIN); applying one
//   inserts `catalog=>` and immediately reopens completion for its tables
// - offers the catalog's tables after `catalog=>` — and after a typed
//   `catalog.`, rewriting the dot to `=>` so users land on valid syntax
function catalogArrowSource(catalogs: Catalog[]): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    const nodeName = syntaxTree(context.state).resolveInner(context.pos, -1).name;
    if (/Comment|String/.test(nodeName)) {
      return null;
    }
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    const ref = CATALOG_REF_RE.exec(before);
    const cleanStart = ref ? !/[\w$".]/.test(before[ref.index - 1] ?? '') : false;
    const catalog = ref && cleanStart ? catalogs.find((c) => c.name === ref[1]) : undefined;
    if (ref && catalog) {
      const [, , gap1, separator, gap2, quote, partial] = ref;
      const separatorFrom = context.pos - partial.length - quote.length - gap2.length - separator.length;
      return {
        from: context.pos - partial.length,
        options: catalog.namespaces
          .flatMap((ns) => ns.tables)
          .map((table) => ({
            label: table.name,
            type: 'class',
            boost: 50,
            // Replace from the separator so a typed `.` (and any stray
            // whitespace around it) is rewritten to `=>`.
            apply: (view: EditorView, _completion: unknown, _from: number, to: number) => {
              view.dispatch({
                changes: { from: separatorFrom - gap1.length, to, insert: `=>${table.name}` },
              });
            },
          })),
        validFor: /^[\w$]*$/,
      };
    }

    const word = context.matchBefore(/[\w$]+/);
    if (!(word || context.explicit)) {
      return null;
    }
    // Skip when completing a dotted member (schema completion's territory).
    const wordFrom = word ? word.from : context.pos;
    if (before[wordFrom - line.from - 1] === '.') {
      return null;
    }
    const afterFromClause = /\b(?:from|join)\s+["\w$]*$/i.test(before);
    return {
      from: wordFrom,
      options: catalogs.map((c) => ({
        label: c.name,
        detail: '=>',
        type: 'namespace',
        boost: afterFromClause ? 60 : 0,
        // Insert the arrow with the name and chain straight into the
        // table list.
        apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
          view.dispatch({
            changes: { from, to, insert: `${c.name}=>` },
            selection: { anchor: from + c.name.length + 2 },
          });
          startCompletion(view);
        },
      })),
      validFor: /^[\w$]*$/,
    };
  };
}

// Reformats the whole document through sql-formatter (dynamically imported to
// keep it out of the initial bundle; postgresql is the closest dialect to
// Oxla) as a single transaction, so undo restores the pre-format text.
async function formatDocument(view: EditorView): Promise<void> {
  const { format } = await import('sql-formatter');
  const current = view.state.doc.toString();
  let next: string;
  try {
    next = format(current, { language: 'postgresql', keywordCase: 'upper' });
  } catch {
    // Unparseable SQL (mid-edit) — leave the text untouched.
    return;
  }
  if (next !== current) {
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
      selection: { anchor: Math.min(view.state.selection.main.head, next.length) },
    });
  }
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { onRun, catalogs, initialQuery },
  ref
) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, name: 'Query 1', sql: initialQuery ?? DEFAULT_QUERY }]);
  const [activeId, setActiveId] = useState(1);
  const nextId = useRef(2);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [histOpen, setHistOpen] = useState(false);
  const [hasSel, setHasSel] = useState(false);
  const isDark = useIsDarkMode();

  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  // Latest run callback, bound into the Cmd/Ctrl+Enter keymap (built once per
  // catalog/theme change, not per render).
  const runRef = useRef<() => void>(() => undefined);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  useImperativeHandle(
    ref,
    () => ({
      setQuery: (sql: string, name?: string) => {
        const id = nextId.current++;
        setTabs((prev) => [...prev, { id, name: name ?? `Query ${id}`, sql }]);
        setActiveId(id);
        requestAnimationFrame(() => editorRef.current?.view?.focus());
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
    const state = editorRef.current?.view?.state;
    const sel = state?.selection.main;
    if (state && sel && !sel.empty) {
      runText(state.sliceDoc(sel.from, sel.to), 'selection');
      return;
    }
    runText(active.sql, 'all');
  };

  // The Cmd/Ctrl+Enter keymap is part of the extensions array (rebuilt only on
  // catalog/theme changes), so it reads fresh state through this render-synced
  // ref (the useLatest pattern — see react-best-practices rules).
  useLayoutEffect(() => {
    runRef.current = doRun;
  });

  const runSelection = () => {
    const state = editorRef.current?.view?.state;
    const sel = state?.selection.main;
    if (state && sel && !sel.empty) {
      runText(state.sliceDoc(sel.from, sel.to), 'selection');
    }
  };

  const extensions = useMemo(() => {
    const sqlSupport = sql({ dialect: PostgreSQL, schema: buildSchema(catalogs), upperCaseKeywords: true });
    return [
      // Prec.highest so Mod-Enter beats the default keymap's insertBlankLine.
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              runRef.current();
              return true;
            },
          },
          // Tab accepts an open completion (Monaco muscle memory); falls
          // through to the default Tab behavior when no popup is open.
          { key: 'Tab', run: acceptCompletion },
          {
            key: 'Shift-Alt-f',
            run: (view) => {
              void formatDocument(view);
              return true;
            },
          },
        ])
      ),
      sqlSupport,
      sqlSupport.language.data.of({ autocomplete: catalogArrowSource(catalogs) }),
      isDark ? DARK_THEME : LIGHT_THEME,
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
          setHasSel(!update.state.selection.main.empty);
        }
      }),
      indentUnit.of('  '),
      EditorState.tabSize.of(2),
    ];
  }, [catalogs, isDark]);

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
            onClick={() => {
              const view = editorRef.current?.view;
              if (view) {
                void formatDocument(view);
              }
            }}
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
        <CodeMirror
          basicSetup={{ foldGutter: false }}
          className="h-full min-w-0 flex-1"
          extensions={extensions}
          height="100%"
          onChange={updateSql}
          ref={editorRef}
          theme="none"
          value={active.sql}
        />
      </div>
    </div>
  );
});
