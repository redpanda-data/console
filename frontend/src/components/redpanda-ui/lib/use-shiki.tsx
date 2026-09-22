'use client';

// Copyright 2026 Redpanda Data, Inc.

import type { Root } from 'hast';
import { type Components, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import {
  type DependencyList,
  Fragment,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import type {
  Awaitable,
  BundledHighlighterOptions,
  BundledLanguage,
  CodeOptionsMeta,
  CodeOptionsThemes,
  CodeToHastOptionsCommon,
  Highlighter,
  RegexEngine,
  StringLiteralUnion,
  ThemeRegistrationAny,
} from 'shiki';
import type { BundledTheme } from 'shiki/themes';

const SPECIAL_LANGUAGES = new Set(['ansi', 'plain', 'plaintext', 'text', 'txt']);
type LoadableLanguage = Parameters<Highlighter['loadLanguage']>[number];
type LoadableTheme = Parameters<Highlighter['loadTheme']>[number];

export const defaultThemes = {
  light: 'github-light',
  dark: 'github-dark-default',
};

export type HighlightOptionsCommon = CodeToHastOptionsCommon<BundledLanguage> &
  CodeOptionsMeta & {
    engine?: 'js' | 'oniguruma' | Awaitable<RegexEngine>;
    components?: Partial<Components>;

    fallbackLanguage?: BundledLanguage;
  };

export type HighlightOptionsThemes = CodeOptionsThemes<BundledTheme>;

export type HighlightOptions = HighlightOptionsCommon & (HighlightOptionsThemes | Record<never, never>);

const highlighters = new Map<string, Promise<Highlighter>>();

export async function _highlight(code: string, options: HighlightOptions) {
  const { lang: initialLang, fallbackLanguage, components: _, engine = 'oniguruma', ...rest } = options;
  let lang = initialLang;
  let themes: CodeOptionsThemes<BundledTheme>;
  let themesToLoad: (ThemeRegistrationAny | StringLiteralUnion<BundledTheme, string>)[];

  if ('theme' in options && options.theme) {
    themes = { theme: options.theme };
    themesToLoad = [themes.theme];
  } else {
    themes = {
      themes: 'themes' in options && options.themes ? options.themes : defaultThemes,
    };
    themesToLoad = Object.values(themes.themes).filter((v) => v !== undefined);
  }

  let highlighter: Highlighter;
  if (typeof engine === 'string') {
    highlighter = await getHighlighter(engine, {
      langs: [],
      themes: themesToLoad,
    });
  } else {
    highlighter = await getHighlighter('custom', {
      engine,
      langs: [],
      themes: themesToLoad,
    });
  }

  try {
    await highlighter.loadLanguage(lang as BundledLanguage);
  } catch {
    lang = fallbackLanguage ?? 'text';
    await highlighter.loadLanguage(lang as BundledLanguage);
  }

  return highlighter.codeToHast(code, {
    lang,
    ...rest,
    ...themes,
    defaultColor: 'themes' in themes ? false : undefined,
  });
}

export function _renderHighlight(hast: Root, options?: HighlightOptions) {
  return toJsxRuntime(hast, {
    jsx,
    jsxs,
    development: false,
    components: options?.components,
    Fragment,
  });
}

/**
 * Get Shiki highlighter instance of Fumadocs (mostly for internal use, don't recommend you to use it).
 *
 * @param engineType - engine type, the engine specified in `options` will only be effective when this is set to `custom`.
 * @param options - Shiki options.
 */
export async function getHighlighter(
  engineType: 'js' | 'oniguruma' | 'custom',
  options: BundledHighlighterOptions<BundledLanguage, BundledTheme>
) {
  const { bundledLanguages, bundledThemes, createHighlighter } = await import('shiki');
  let highlighter = highlighters.get(engineType);

  if (!highlighter) {
    let engine: Awaitable<RegexEngine> | undefined;

    if (engineType === 'js') {
      engine = import('shiki/engine/javascript').then((res) => res.createJavaScriptRegexEngine());
    } else if (engineType === 'oniguruma' || !options.engine) {
      engine = import('shiki/engine/oniguruma').then((res) => res.createOnigurumaEngine(import('shiki/wasm')));
    } else {
      engine = options.engine;
    }

    highlighter = createHighlighter({
      ...options,
      engine,
    });

    highlighters.set(engineType, highlighter);
    return highlighter;
  }

  return highlighter.then(async (instance) => {
    const languages = options.langs.filter(
      (language): language is LoadableLanguage =>
        typeof language !== 'string' || language in bundledLanguages || SPECIAL_LANGUAGES.has(language)
    );
    const themes = options.themes.filter(
      (theme): theme is LoadableTheme => typeof theme !== 'string' || theme === 'none' || theme in bundledThemes
    );

    if (languages.length !== options.langs.length || themes.length !== options.themes.length) {
      throw new Error('Shiki received an unregistered language or theme');
    }

    await Promise.all([instance.loadLanguage(...languages), instance.loadTheme(...themes)]);

    return instance;
  });
}

export async function highlight(code: string, options: HighlightOptions): Promise<ReactNode> {
  return _renderHighlight(await _highlight(code, options), options);
}

interface Task {
  aborted: boolean;
  key: string;
}

export function useShiki(
  code: string,
  {
    withPrerenderScript = false,
    loading,
    ...options
  }: HighlightOptions & {
    withPrerenderScript?: boolean;

    /**
     * Displayed before highlighter is loaded.
     */
    loading?: ReactNode;
  },
  deps?: DependencyList
): ReactNode {
  const markupId = useId();
  const key = deps ? JSON.stringify(deps) : `${options.lang}:${code}`;
  const shikiOptions: HighlightOptions = {
    ...options,
    engine: options.engine ?? 'js',
  };

  const currentTask = useRef<Task | undefined>(undefined);

  const [rendered, setRendered] = useState<ReactNode>(() => {
    const element =
      withPrerenderScript && typeof document !== 'undefined'
        ? document.querySelector(`[data-markup-id="${markupId}"]`)
        : null;
    const attr = element?.getAttribute('data-markup');

    if (attr) {
      const hast = JSON.parse(attr);
      return renderHighlightWithMarkup(markupId, hast, shikiOptions, attr);
    }

    return loading;
  });

  const startHighlight = useEffectEvent((task: Task) => {
    highlight(code, shikiOptions)
      .then((result) => {
        if (!task.aborted) {
          setRendered(result);
        }
      })
      .catch((error: unknown) => {
        if (!task.aborted) {
          const message = error instanceof Error ? error.message : 'Could not highlight code.';
          setRendered(<span role="alert">{message}</span>);
        }
      });
  });

  useEffect(
    function synchronizeHighlight() {
      if (currentTask.current?.key === key) {
        return;
      }

      if (currentTask.current) {
        currentTask.current.aborted = true;
      }

      const task: Task = {
        key,
        aborted: false,
      };
      currentTask.current = task;

      startHighlight(task);
    },
    [key]
  );

  if (typeof window === 'undefined') {
    // For server-side rendering, we need to handle this differently without use()
    // This will be handled by the useEffect above when the component mounts
    return loading;
  }

  return rendered;
}

function renderHighlightWithMarkup(id: string, tree: Root, shikiOptions: HighlightOptions, rawAttr?: string) {
  const Pre = (shikiOptions.components?.pre ?? 'pre') as 'pre';

  return _renderHighlight(tree, {
    ...shikiOptions,
    components: {
      ...shikiOptions.components,
      pre: (props) => <Pre {...props} data-markup={rawAttr ?? JSON.stringify(tree)} data-markup-id={id} />,
    },
  });
}
