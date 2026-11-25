'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import type { VariantProps } from 'class-variance-authority';
import React from 'react';
import { CopyButton } from './copy-button';
import { SanitizedHtml } from './sanitized-html';
import { escapeHtmlText } from './sanitized-html/html';
import { cn } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';
import { codeTabsActiveVariants, codeTabsContentVariants, codeTabsListVariants, codeTabsVariants } from './code-tabs/variants';

interface CodeTabItem {
  code: string;
  id: string;
  label: React.ReactNode;
}

interface HighlightCodeTabsInput {
  darkTheme: string;
  items: CodeTabItem[];
  lang: string;
  lightTheme: string;
  theme?: 'light' | 'dark' | 'system';
}

async function highlightCodeTabs({
  darkTheme,
  items,
  lang,
  lightTheme,
  theme,
}: HighlightCodeTabsInput): Promise<CodeTabItem[]> {
  const { codeToHtml } = await import('shiki');
  return await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      label: item.label,
      code: await codeToHtml(item.code, {
        lang,
        themes: { dark: darkTheme, light: lightTheme },
        // `false` keeps both themes in the markup for the CSS below to choose between.
        defaultColor: theme === 'light' || theme === 'dark' ? theme : false,
      }),
    }))
  );
}

function createFallbackItems(items: CodeTabItem[]): CodeTabItem[] {
  return items.map((item) => ({ ...item, code: `<pre><code>${escapeHtmlText(item.code)}</code></pre>` }));
}

type CodeTabsProps = {
  codes?: Record<string, string> | undefined;
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string, details: TabsPrimitive.Root.ChangeEventDetails) => void) | undefined;
  items?: CodeTabItem[] | undefined;
  lang?: string | undefined;
  themes?:
    | {
        light: string;
        dark: string;
      }
    | undefined;
  theme?: 'light' | 'dark' | 'system' | undefined;
  copyButton?: boolean | undefined;
  onCopy?: ((content: string) => void) | undefined;
  testId?: string | undefined;
} & Omit<TabsPrimitive.Root.Props, 'children' | 'value' | 'defaultValue' | 'onValueChange' | 'onCopy'> &
  VariantProps<typeof codeTabsVariants>;

const DEFAULT_THEMES = { light: 'github-light-high-contrast', dark: 'github-dark-default' };

function normalizeCodeItems(
  items: CodeTabItem[] | undefined,
  codes: Record<string, string> | undefined
): CodeTabItem[] {
  if (items !== undefined) {
    return items;
  }
  if (codes !== undefined) {
    return Object.entries(codes).map(([id, code]) => ({ id, label: id, code }));
  }
  return [];
}

function CodeTabs({
  codes,
  items,
  lang = 'bash',
  themes = DEFAULT_THEMES,
  theme,
  className,
  defaultValue,
  value,
  onValueChange,
  copyButton = true,
  onCopy,
  variant,
  testId,
  ...props
}: CodeTabsProps) {
  // Accept either `items` or the simpler `codes` shape; normalize to items.
  const normalizedItems = normalizeCodeItems(items, codes);

  const [highlightedItems, setHighlightedItems] = React.useState<CodeTabItem[] | null>(null);
  const [localSelectedCode, setSelectedCode] = React.useState<string>(defaultValue ?? normalizedItems[0]?.id ?? '');
  const selectedCode = value ?? localSelectedCode;
  const { dark: darkTheme, light: lightTheme } = themes;
  const [request, setRequest] = React.useState({
    codes,
    sourceItems: items,
    lang,
    darkTheme,
    lightTheme,
    theme,
    pending: true,
  });
  const requestChanged =
    request.codes !== codes ||
    request.sourceItems !== items ||
    request.lang !== lang ||
    request.darkTheme !== darkTheme ||
    request.lightTheme !== lightTheme ||
    request.theme !== theme;
  if (requestChanged) {
    setRequest({ codes, sourceItems: items, lang, darkTheme, lightTheme, theme, pending: true });
  }
  const pending = requestChanged || request.pending;

  React.useEffect(
    function highlightCodeItems() {
      let cancelled = false;
      const sourceItems = normalizeCodeItems(items, codes);
      const complete = (result: CodeTabItem[]) => {
        setHighlightedItems(result);
        setRequest({ codes, sourceItems: items, lang, darkTheme, lightTheme, theme, pending: false });
      };
      highlightCodeTabs(omitUndefined({ darkTheme, items: sourceItems, lang, lightTheme, theme }))
        .then((newHighlightedItems) => {
          if (!cancelled) {
            complete(newHighlightedItems);
          }
        })
        .catch(() => {
          if (!cancelled) {
            complete(createFallbackItems(sourceItems));
          }
        });

      return () => {
        cancelled = true;
      };
    },
    [codes, darkTheme, items, lang, lightTheme, theme]
  );

  const selectedItem = normalizedItems.find((item) => item.id === selectedCode);

  return (
    <TabsPrimitive.Root
      className={cn(codeTabsVariants({ variant }), className)}
      data-highlight-pending={pending || undefined}
      data-slot="install-tabs"
      data-testid={testId}
      {...props}
      onValueChange={(val: unknown, eventDetails) => {
        if (typeof val !== 'string') {
          throw new TypeError('CodeTabs values must be string item identifiers.');
        }
        if (value === undefined) {
          setSelectedCode(val);
        }
        onValueChange?.(val, eventDetails);
      }}
      value={selectedCode}
    >
      <div className={codeTabsListVariants({ variant })} data-slot="install-tabs-list">
        <TabsPrimitive.List className="relative flex h-full min-w-0 [scrollbar-width:none] gap-x-1 overflow-x-auto sm:gap-x-2 [&::-webkit-scrollbar]:hidden">
          <TabsPrimitive.Indicator
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-(--active-tab-top) left-(--active-tab-left) z-0 h-(--active-tab-height) w-(--active-tab-width)',
              codeTabsActiveVariants({ variant })
            )}
            data-slot="code-tabs-indicator"
          />
          {highlightedItems?.map((item) => (
            <TabsPrimitive.Tab
              className="relative z-10 inline-flex h-full shrink-0 cursor-pointer items-center justify-center rounded-sm px-2 text-body-sm font-medium whitespace-nowrap text-subtle transition-colors outline-none hover:not-data-[active]:bg-accent hover:not-data-[active]:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[active]:text-selected motion-reduce:transition-none sm:px-3"
              data-slot="code-tabs-trigger"
              key={item.id}
              value={item.id}
            >
              {item.label}
            </TabsPrimitive.Tab>
          ))}
        </TabsPrimitive.List>

        {copyButton && highlightedItems !== null && selectedItem !== undefined ? (
          <CopyButton className="-me-2" content={selectedItem.code} onCopy={onCopy} size="sm" variant="ghost" />
        ) : null}
      </div>
      <div data-slot="install-tabs-contents">
        {highlightedItems?.map((item) => (
          <TabsPrimitive.Panel
            className={codeTabsContentVariants({ variant })}
            data-slot="install-tabs-content"
            key={item.id}
            value={item.id}
          >
            <div className="[&_.shiki_code_span]:code-token [&_code]:!text-body [&_pre,_&_code]:border-none [&_pre,_&_code]:!bg-transparent">
              <SanitizedHtml html={item.code} />
            </div>
          </TabsPrimitive.Panel>
        ))}
      </div>
    </TabsPrimitive.Root>
  );
}

export { type CodeTabItem, CodeTabs, type CodeTabsProps };
