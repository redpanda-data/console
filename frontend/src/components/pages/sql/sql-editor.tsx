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
import { PostgreSQL, type SQLNamespace, schemaCompletionSource, sql as sqlLanguage } from '@codemirror/lang-sql';
import { HighlightStyle, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { EditorState, type Extension, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { Button } from 'components/redpanda-ui/components/button';
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { FileText, History, Play, Plus, Terminal, Wand2, X } from 'lucide-react';
import {
  forwardRef,
  type MouseEvent,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { isMacOS } from 'utils/platform';
import { z } from 'zod';

import type { Catalog, TableRef } from './sql-types';

// Lets the workspace open a query in a new editor tab.
export type SqlEditorHandle = {
  /** Open `sql` in a new tab named `name` (or "Query N") and focus it. */
  setQuery: (sql: string, name?: string) => void;
};

export type SqlEditorProps = {
  /** Run a statement (the current selection if any, else the whole tab). */
  onRun: (sql: string) => void;
  /** Loaded catalog tree; drives schema-aware autocomplete. */
  catalogs: Catalog[];
  /** SQL to seed the first tab with. */
  initialQuery?: string;
};

const HISTORY_KEY = 'rp_sql_history_v1';

const HistoryEntrySchema = z.object({ sql: z.string(), at: z.number() });

type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

function loadHistory(): HistoryEntry[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
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
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    // best-effort; ignore quota/serialization failures
  }
}

type Tab = { id: number; name: string; sql: string };

const DEFAULT_QUERY =
  'SELECT vin, make, model, year, price_usd\nFROM default_redpanda_catalog=>cars\nWHERE in_stock = true\nORDER BY price_usd DESC\nLIMIT 100;';

// Re-render the editor when the registry `.dark` class toggles.
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

// Transparent editor/gutter so the `bg-background` surface shows through.
function editorChrome(mode: 'light' | 'dark'): Extension {
  return EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', height: '100%', fontSize: '13px' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
        lineHeight: '21px',
      },
      '.cm-content': { padding: '12px 0' },
      // A global `::selection` rule otherwise whitens selected text; theme the
      // selection pair instead. Full focused path matches the base rule's
      // specificity so this (later) theme wins.
      '& .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
        backgroundColor: 'var(--color-selection)',
      },
      '.cm-content ::selection': { color: 'var(--color-selection-foreground)' },
      '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--color-muted-foreground)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-foreground)' },
      '.cm-activeLine': { backgroundColor: 'var(--color-surface-default-hover)' },
    },
    { dark: mode === 'dark' }
  );
}

// SQL syntax palette from semantic tokens, so it tracks light/dark.
function sqlHighlight(): Extension {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: 'var(--color-secondary)', fontWeight: 'bold' },
      {
        tag: [tags.standard(tags.name), tags.function(tags.variableName), tags.typeName],
        color: 'var(--color-primary)',
      },
      { tag: [tags.string, tags.special(tags.string)], color: 'var(--color-success)' },
      { tag: tags.number, color: 'var(--color-warning)' },
      { tag: tags.comment, color: 'var(--color-muted-foreground)', fontStyle: 'italic' },
      {
        tag: [tags.operator, tags.punctuation, tags.separator, tags.paren, tags.brace, tags.squareBracket],
        color: 'var(--color-muted-foreground)',
      },
      { tag: tags.name, color: 'var(--color-strong)' },
    ])
  );
}

const LIGHT_THEME: Extension = [editorChrome('light'), sqlHighlight()];
const DARK_THEME: Extension = [editorChrome('dark'), sqlHighlight()];

function tableNamespace(table: TableRef): SQLNamespace {
  return {
    self: { label: table.name, type: 'class' },
    children: (table.columns ?? []).map((col) => ({ label: col.name, type: 'property', detail: col.short })),
  };
}

// Bare table name → columns. Powers alias/column resolution only
// (schemaColumnSource); tables aren't nested under catalogs since Oxla uses
// `catalog=>table` arrow notation, handled by catalogArrowSource.
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

// Schema completion limited to dotted members (`c.` → columns); bare table
// names are suppressed at the top level so catalogArrowSource owns them.
function schemaColumnSource(catalogs: Catalog[]): (context: CompletionContext) => CompletionResult | null {
  const source = schemaCompletionSource({ dialect: PostgreSQL, schema: buildSchema(catalogs) });
  return (context) => {
    const result = source(context);
    if (!result || result instanceof Promise) {
      return null;
    }
    const dotted = context.state.sliceDoc(result.from - 1, result.from) === '.';
    return dotted ? result : null;
  };
}

// Matches an identifier followed by `=>` or `.` and a partial table name,
// anchored at the cursor: [, name, gap1, separator, gap2, quote, partial].
const CATALOG_REF_RE = /([A-Za-z_][\w$]*)(\s*)(=>|\.)(\s*)("?)([\w$]*)$/;
const COMMENT_OR_STRING_NODE_RE = /Comment|String/;
const CATALOG_REF_BOUNDARY_RE = /[\w$".]/;
const COMPLETION_IDENTIFIER_RE = /[\w$]+/;
const VALID_COMPLETION_RE = /^[\w$]*$/;
const AFTER_FROM_OR_JOIN_RE = /\b(?:from|join)\s+["\w$]*$/i;
// Cursor sits immediately after `FROM `/`JOIN ` and a single trailing space —
// the moment to auto-open the catalog (`catalog=>`) helper.
const FROM_JOIN_TRIGGER_RE = /\b(?:from|join)\s$/i;

function catalogTableCompletionResult(
  catalog: Catalog,
  ref: RegExpExecArray,
  cursorPosition: number
): CompletionResult {
  const [, , gap1, separator, gap2, quote, partial] = ref;
  const separatorFrom = cursorPosition - partial.length - quote.length - gap2.length - separator.length;

  return {
    from: cursorPosition - partial.length,
    options: catalog.namespaces
      .flatMap((namespace) => namespace.tables)
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
    validFor: VALID_COMPLETION_RE,
  };
}

function catalogNameCompletionResult(catalogs: Catalog[], from: number, before: string): CompletionResult {
  const afterFromClause = AFTER_FROM_OR_JOIN_RE.test(before);
  return {
    from,
    options: catalogs.map((catalog) => ({
      label: catalog.name,
      detail: '=>',
      type: 'namespace',
      boost: afterFromClause ? 60 : 0,
      // Insert the arrow with the name and chain straight into the table list.
      apply: (view: EditorView, _completion: unknown, applyFrom: number, to: number) => {
        view.dispatch({
          changes: { from: applyFrom, to, insert: `${catalog.name}=>` },
          selection: { anchor: applyFrom + catalog.name.length + 2 },
        });
        startCompletion(view);
      },
    })),
    validFor: VALID_COMPLETION_RE,
  };
}

// Completion for Oxla's `catalog=>table` notation (which the generic schema
// completion can't model): catalog names after FROM/JOIN, then the catalog's
// tables, rewriting a typed `catalog.` to `=>`.
function catalogArrowSource(catalogs: Catalog[]): (context: CompletionContext) => CompletionResult | null {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CodeMirror completion context handling is branchy by API shape.
  return (context) => {
    const nodeName = syntaxTree(context.state).resolveInner(context.pos, -1).name;
    if (COMMENT_OR_STRING_NODE_RE.test(nodeName)) {
      return null;
    }
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    const ref = CATALOG_REF_RE.exec(before);
    const cleanStart = ref ? !CATALOG_REF_BOUNDARY_RE.test(before[ref.index - 1] ?? '') : false;
    const catalog = ref && cleanStart ? catalogs.find((c) => c.name === ref[1]) : undefined;
    if (ref && catalog) {
      return catalogTableCompletionResult(catalog, ref, context.pos);
    }

    // Offer catalogs once the caller is right after FROM/JOIN even with no
    // partial typed yet, so the auto-trigger below can pop `catalog=>`.
    const word = context.matchBefore(COMPLETION_IDENTIFIER_RE);
    const afterFromClause = AFTER_FROM_OR_JOIN_RE.test(before);
    if (!(word || context.explicit || afterFromClause)) {
      return null;
    }
    // Skip when completing a dotted member (schema completion's territory).
    const wordFrom = word ? word.from : context.pos;
    if (before[wordFrom - line.from - 1] === '.') {
      return null;
    }
    return catalogNameCompletionResult(catalogs, wordFrom, before);
  };
}

// Reformat via sql-formatter (lazy-loaded; postgresql ≈ Oxla) in one
// transaction so undo restores the original.
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

function useNextTabId(initialId: number) {
  const nextId = useRef(initialId);
  return useCallback(() => {
    const id = nextId.current;
    nextId.current += 1;
    return id;
  }, []);
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(
  function SqlEditorComponent(editorProps, forwardedRef) {
    const { onRun: runQuery, catalogs, initialQuery } = editorProps;
    const [tabs, setTabs] = useState<Tab[]>([{ id: 1, name: 'Query 1', sql: initialQuery ?? DEFAULT_QUERY }]);
    const [activeId, setActiveId] = useState(1);
    const nextTabId = useNextTabId(2);
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
      forwardedRef,
      () => ({
        setQuery: (queryText: string, tabName?: string) => {
          const id = nextTabId();
          setTabs((prev) => [...prev, { id, name: tabName ?? `Query ${id}`, sql: queryText }]);
          setActiveId(id);
          requestAnimationFrame(() => editorRef.current?.view?.focus());
        },
      }),
      [nextTabId]
    );

    const updateSql = (queryText: string) => {
      setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, sql: queryText } : t)));
    };

    const runText = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const entry: HistoryEntry = { sql: trimmed, at: Date.now() };
      const nh = [entry, ...history.filter((h) => h.sql !== entry.sql)].slice(0, 40);
      setHistory(nh);
      saveHistory(nh);
      runQuery(trimmed);
    };

    // Run the current selection if any, else the whole tab.
    const doRun = () => {
      const state = editorRef.current?.view?.state;
      const sel = state?.selection.main;
      if (state && sel && !sel.empty) {
        runText(state.sliceDoc(sel.from, sel.to));
        return;
      }
      runText(active.sql);
    };

    // Keeps the keymap's run callback current without rebuilding the extensions.
    runRef.current = doRun;

    const runSelection = () => {
      const state = editorRef.current?.view?.state;
      const sel = state?.selection.main;
      if (state && sel && !sel.empty) {
        runText(state.sliceDoc(sel.from, sel.to));
      }
    };

    const extensions = useMemo(() => {
      // No `schema` here — schemaColumnSource adds it back for dotted members only.
      const sqlSupport = sqlLanguage({ dialect: PostgreSQL, upperCaseKeywords: true });
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
                formatDocument(view).catch(() => undefined);
                return true;
              },
            },
          ])
        ),
        sqlSupport,
        sqlSupport.language.data.of({ autocomplete: catalogArrowSource(catalogs) }),
        sqlSupport.language.data.of({ autocomplete: schemaColumnSource(catalogs) }),
        isDark ? DARK_THEME : LIGHT_THEME,
        EditorView.updateListener.of((update) => {
          if (update.selectionSet) {
            setHasSel(!update.state.selection.main.empty);
          }
          // Auto-open the catalog helper right after a typed `FROM `/`JOIN `
          // (typing events only, so formatting/seeding don't re-trigger it).
          if (update.docChanged && update.transactions.some((tr) => tr.isUserEvent('input.type'))) {
            const pos = update.state.selection.main.head;
            const lineText = update.state.doc.lineAt(pos);
            if (FROM_JOIN_TRIGGER_RE.test(lineText.text.slice(0, pos - lineText.from))) {
              startCompletion(update.view);
            }
          }
        }),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
      ];
    }, [catalogs, isDark]);

    const addTab = () => {
      const id = nextTabId();
      setTabs((prev) => [...prev, { id, name: `Query ${id}`, sql: '' }]);
      setActiveId(id);
    };

    const closeTab = (id: number, e: MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const nextTabs = prev.filter((t) => t.id !== id);
        if (nextTabs.length === 0) {
          const nid = nextTabId();
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
              <Button
                aria-label="New query"
                onClick={addTab}
                size="icon-sm"
                title="New query"
                variant="secondary-ghost"
              >
                <Plus />
              </Button>
            </TabsList>
          </Tabs>
          <div className="flex shrink-0 items-center gap-1.5 border-b pr-2">
            <Popover onOpenChange={setHistOpen} open={histOpen}>
              <PopoverTrigger
                render={
                  <Button size="sm" title="Query history (this browser)" variant="secondary-ghost">
                    <History /> History
                  </Button>
                }
              />
              <PopoverContent align="end" className="max-h-96 w-96 overflow-y-auto p-1">
                <div className="px-2 py-1.5 font-semibold text-body-sm text-muted-foreground uppercase tracking-wider">
                  Recent queries · this browser
                </div>
                {history.length === 0 ? (
                  <div className="p-2 text-body text-muted-foreground">No queries yet</div>
                ) : null}
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
                  formatDocument(view).catch(() => undefined);
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
  }
);
