'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { type CodeHighlighter, type HighlightState, loadHighlighter, resolveLanguage } from './highlighter';

interface Highlighted {
  highlighter: CodeHighlighter | null;
  lines: ReactNode[];
  state?: HighlightState;
  /** The complete lines tokenized so far, newline included. */
  text: string;
}

const CRLF = /\r\n?/g;
const TRAILING_NEWLINE = /\n$/;

/**
 * Highlights `value` as `language`, one React node per line. Returns plain lines until the
 * highlighter loads, and for a language that is not listed. While the code streams, only the new
 * lines are tokenized, so finished lines keep their nodes and React skips them.
 */
export function useHighlightedCode(value: string, language: string): ReactNode[] {
  // Line endings as the highlighter splits them, without the trailing one, which would render as an
  // extra empty line.
  const code = value.replace(CRLF, '\n').replace(TRAILING_NEWLINE, '');
  const [loaded, setLoaded] = useState<{ language: string; highlighter: CodeHighlighter | null } | null>(null);
  const highlighter = loaded?.language === language ? loaded.highlighter : null;

  useEffect(
    function loadLanguage() {
      // An unlisted language stays plain, so there is nothing to load or re-render for.
      if (!resolveLanguage(language)) {
        return;
      }

      let cancelled = false;

      loadHighlighter(language)
        .then((next) => {
          if (!cancelled) {
            setLoaded({ language, highlighter: next });
          }
        })
        .catch(() => {
          // A grammar that fails to load leaves the code as plain lines, which is what an unlisted
          // language gets too; there is nothing more useful to show.
        });

      return () => {
        cancelled = true;
      };
    },
    [language]
  );

  // The complete lines, highlighted. While the code streams, only the new lines are tokenized,
  // starting from the grammar state of the last one.
  const [done, setDone] = useState<Highlighted>({ highlighter: null, text: '', lines: [] });

  let next = done;

  if (next.highlighter !== highlighter || !code.startsWith(next.text)) {
    next = { highlighter, text: '', lines: [] };
  }

  const end = code.lastIndexOf('\n') + 1;

  if (highlighter && end > next.text.length) {
    const result = highlighter.highlight(code.slice(next.text.length, end - 1), next.state);

    next = {
      highlighter,
      text: code.slice(0, end),
      lines: [...next.lines, ...result.lines],
      state: result.state,
    };
  }

  // Storing what the last render tokenized, so the next one starts from there.
  if (next !== done) {
    setDone(next);
  }

  // The last line is still being written, so it is tokenized on every render.
  const tail = code.slice(end);

  return useMemo(() => {
    if (!highlighter) {
      return code.split('\n');
    }

    return [...next.lines, highlighter.highlight(tail, next.state).lines[0]];
  }, [code, highlighter, next, tail]);
}
