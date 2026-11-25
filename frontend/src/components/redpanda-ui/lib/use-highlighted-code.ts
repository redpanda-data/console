'use client';

import { type ReactNode, useEffect, useState } from 'react';

import {
  type CodeHighlighter,
  type HighlightState,
  loadHighlighter,
  resolveLanguage,
  stripAnsiControls,
} from './highlighter';

interface Highlighted {
  highlighter: CodeHighlighter | null;
  lines: ReactNode[];
  state?: HighlightState | undefined;
  /** Cached unfinished line, or readable remainder if tokenization failed. */
  tail?: { text: string; lines: ReactNode[] } | undefined;
  /** The complete lines tokenized so far, newline included. */
  text: string;
}

const CRLF = /\r\n?/g;
const TRAILING_NEWLINE = /\n$/;
// A scheduling target, not an input limit or a hard execution-time bound. Never split a grammar line.
const BATCH_LENGTH = 8 * 1024;

function plainLines(code: string, language: string | null): string[] {
  return (language === 'ansi' ? stripAnsiControls(code) : code).split('\n');
}

/**
 * Highlights `value` as `language`, one React node per line. Plain lines come first, then
 * cancellable timer tasks tokenize newline-aligned batches outside React's render path. Finished
 * lines and their grammar state are reused while code streams; there is no total input-size cap.
 * A single long line or expensive grammar can still block a task; this is not worker isolation.
 */
export function useHighlightedCode(value: string, language: string): ReactNode[] {
  return useHighlightedCodeState(value, language).lines;
}

/** The rendered lines and loading/tokenization state; unlisted languages are never pending. */
export function useHighlightedCodeState(value: string, language: string): { lines: ReactNode[]; pending: boolean } {
  // Line endings as the highlighter splits them, without the trailing one, which would render as an
  // extra empty line.
  const code = value.replace(CRLF, '\n').replace(TRAILING_NEWLINE, '');
  const resolvedLanguage = resolveLanguage(language);
  const enabled = resolvedLanguage !== null;
  const [loaded, setLoaded] = useState<{ language: string; highlighter: CodeHighlighter | null } | null>(null);
  const highlighter = enabled && loaded?.language === language ? loaded.highlighter : null;
  const shouldLoad = enabled && highlighter === null;
  const [request, setRequest] = useState({ language, enabled, pending: shouldLoad });
  const requestChanged = request.language !== language || request.enabled !== enabled;
  if (requestChanged) {
    setRequest({ language, enabled, pending: shouldLoad });
  }
  const loading = requestChanged ? shouldLoad : request.pending;

  useEffect(
    function loadLanguage() {
      // Unlisted languages stay plain without loading a highlighter.
      if (!shouldLoad) {
        return;
      }

      let cancelled = false;

      loadHighlighter(language)
        .then((loadedHighlighter) => {
          if (!cancelled) {
            setLoaded({ language, highlighter: loadedHighlighter });
            setRequest({ language, enabled, pending: false });
          }
        })
        .catch(() => {
          // A grammar that fails to load leaves the code as plain lines, which is what an unlisted
          // language gets too; there is nothing more useful to show.
          if (!cancelled) {
            setLoaded({ language, highlighter: null });
            setRequest({ language, enabled, pending: false });
          }
        });

      return () => {
        cancelled = true;
      };
    },
    [language, enabled, shouldLoad]
  );

  const [done, setDone] = useState<Highlighted>({ highlighter: null, text: '', lines: [] });

  const current = done.highlighter === highlighter && code.startsWith(done.text) ? done : null;
  const rest = code.slice(current?.text.length ?? 0);
  const tail = current?.tail?.text === rest ? current.tail.lines : null;

  useEffect(
    function highlightBatch() {
      if (highlighter === null || tail !== null) {
        return;
      }
      const next: Highlighted = current ?? { highlighter, text: '', lines: [] };

      const timeout = setTimeout(() => {
        // Finish at a newline near the target. An indivisible long line may exceed it: cutting
        // inside a line would change TextMate anchors and corrupt multiline grammar state.
        let end = code.lastIndexOf('\n', next.text.length + BATCH_LENGTH) + 1;
        if (end <= next.text.length) {
          end = code.indexOf('\n', next.text.length) + 1;
        }
        try {
          if (end > next.text.length) {
            const result = highlighter.highlight(code.slice(next.text.length, end - 1), next.state);
            setDone({
              highlighter,
              text: code.slice(0, end),
              lines: [...next.lines, ...result.lines],
              state: result.state,
            });
          } else {
            setDone({ ...next, tail: { text: rest, lines: highlighter.highlight(rest, next.state).lines } });
          }
        } catch {
          // A failing grammar leaves the remainder readable, not an uncaught timer error or an
          // endless pending state. A subsequent edit can retry from the last completed line.
          setDone({ ...next, tail: { text: rest, lines: plainLines(rest, resolvedLanguage) } });
        }
      }, 0);
      return () => {
        clearTimeout(timeout);
      };
    },
    [code, highlighter, current, rest, tail, resolvedLanguage]
  );

  // Never tokenize while rendering, including the unfinished streamed tail. Keep a matching
  // highlighted prefix visible while later batches are pending; changed code/languages cannot
  // display stale tokens. Copy remains the caller's original, unnormalized source.
  if (highlighter === null) {
    return { lines: plainLines(code, resolvedLanguage), pending: loading };
  }
  return {
    lines: [...(current?.lines ?? []), ...(tail ?? plainLines(rest, resolvedLanguage))],
    pending: tail === null,
  };
}
