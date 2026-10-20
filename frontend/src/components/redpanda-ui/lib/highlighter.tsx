import type { CSSProperties, ReactNode } from 'react';
// Types only: Shiki itself loads with the first block that highlights, not with the page.
import type { GrammarState, HighlighterCore } from 'shiki/core';

// Add the languages you need. Each one loads the first time it is used.
const languages = {
  bash: () => import('shiki/langs/shellscript.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  log: () => import('shiki/langs/log.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  protobuf: () => import('shiki/langs/proto.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
};

type Language = keyof typeof languages;

const LANGUAGE_CLASS_PREFIX = /^language-/;

const aliases: Record<string, Language> = {
  golang: 'go',
  js: 'javascript',
  md: 'markdown',
  proto: 'protobuf',
  ps1: 'powershell',
  py: 'python',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'bash',
};

/** One Shiki theme per app theme, matching `code-editor` and `code-tabs`. */
const THEMES = { light: 'github-light', dark: 'github-dark-default' } as const;

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
  highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')])
    .then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark-default.mjs')],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      })
    )
    .catch((error: unknown) => {
      // Forget a failed start (a theme chunk lost to a deploy, say), so the next block tries again
      // instead of every block staying plain until a reload.
      highlighter = undefined;
      throw error;
    });

  return highlighter;
}

/** An SGR escape sequence starts `ESC [`, takes digits and semicolons, and ends `m`. */
const SGR_START = '\u001b[';
const SGR_PARAMS = /^[0-9;]*$/;

/**
 * Where ANSI output left off: the SGR sequences still in force at the end of the last chunk.
 * Prefixed to the next chunk, they colour it the way one piece would have been.
 */
interface AnsiState {
  kind: 'ansi';
  open: string;
}

/** Grammar state for a language, or the open SGR sequences for ANSI output. */
export type HighlightState = GrammarState | AnsiState;

const isAnsiState = (state: HighlightState | undefined): state is AnsiState =>
  state !== undefined && 'kind' in state && state.kind === 'ansi';

/** The SGR sequences still in force after `text`, given those in force before it. */
function openSequences(text: string, before: string): string {
  let open = before;
  for (let at = text.indexOf(SGR_START); at !== -1; at = text.indexOf(SGR_START, at + SGR_START.length)) {
    const end = text.indexOf('m', at + SGR_START.length);
    const params = end === -1 ? null : text.slice(at + SGR_START.length, end);
    if (params === null || !SGR_PARAMS.test(params)) {
      continue;
    }
    const sequence = text.slice(at, end + 1);
    // A reset clears everything before it; `0;31m` resets and then sets red, so it stays open itself.
    if (params === '' || params === '0') {
      open = '';
    } else if (params.startsWith('0;')) {
      open = sequence;
    } else {
      open += sequence;
    }
  }
  return open;
}

/**
 * The listed language a name refers to, `'ansi'` for terminal output, or null for anything else.
 * Takes the `language-*` class a Markdown fence carries as well as the bare name.
 */
export function resolveLanguage(language: string): Language | 'ansi' | null {
  const name = language.toLowerCase().replace(LANGUAGE_CLASS_PREFIX, '');

  if (name === 'ansi') {
    return name;
  }

  if (name in languages) {
    return name as Language;
  }

  return aliases[name] ?? null;
}

export interface CodeHighlighter {
  /**
   * One React node per line, and the state after the last line. Pass that state back to continue
   * where the code left off.
   */
  highlight: (code: string, state?: HighlightState) => { lines: ReactNode[]; state: HighlightState | undefined };
}

/** Loads a language and returns a highlighter for it, or null for a language that is not listed. */
export async function loadHighlighter(language: string): Promise<CodeHighlighter | null> {
  const lang = resolveLanguage(language);

  if (!lang) {
    return null;
  }

  const shiki = await getHighlighter();

  if (lang !== 'ansi' && !shiki.getLoadedLanguages().includes(lang)) {
    await shiki.loadLanguage(languages[lang]);
  }

  return {
    highlight(code, state) {
      // ANSI has no grammar state, but a colour runs on across lines until a reset. Starting the
      // chunk with the sequences still open keeps streamed output the colour one piece would be.
      const ansiOpen = isAnsiState(state) ? state.open : '';
      const grammarState = isAnsiState(state) ? undefined : state;
      const tokens = shiki.codeToTokens(lang === 'ansi' ? ansiOpen + code : code, {
        lang,
        themes: THEMES,
        defaultColor: false,
        grammarState,
      }).tokens;

      return {
        lines: tokens.map((line) =>
          // ANSI tokens all report offset 0, so a token's place in its line is what identifies it.
          line.map((token, index) => (
            <span
              // theme.css's `code-token` picks the colour for the theme around it.
              className="code-token"
              data-slot="code-block-token"
              key={index}
              style={
                {
                  '--shiki-light': token.htmlStyle?.['--shiki-light'],
                  '--shiki-dark': token.htmlStyle?.['--shiki-dark'],
                } as CSSProperties
              }
            >
              {token.content}
            </span>
          ))
        ),
        state:
          lang === 'ansi' ? { kind: 'ansi', open: openSequences(code, ansiOpen) } : shiki.getLastGrammarState(tokens),
      };
    },
  };
}

/**
 * One React node per line, or null for a language that is not listed. Async, so a Server Component
 * can highlight and keep Shiki out of the client bundle.
 */
export async function highlightCode(code: string, language: string): Promise<ReactNode[] | null> {
  const codeHighlighter = await loadHighlighter(language);

  return codeHighlighter ? codeHighlighter.highlight(code).lines : null;
}
