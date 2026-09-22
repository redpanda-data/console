'use client';

// Copyright 2026 Redpanda Data, Inc.

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { CopyButton } from './copy-button';
import { escapeHtmlText, SanitizedHtml } from './sanitized-html';
import { Tabs, TabsContent, TabsContents, TabsList, type TabsProps, TabsTrigger } from './tabs';
import { cn } from '../lib/utils';

const codeTabsVariants = cva('w-full gap-0 overflow-hidden rounded-xl border bg-card', {
  variants: {
    variant: {
      standard: 'w-full gap-0 overflow-hidden rounded-xl border bg-card',
    },
  },
  defaultVariants: {
    variant: 'standard',
  },
});

/**
 * Shiki emits both themes' colours as custom properties per span; these rules pick the one matching the
 * app theme, so the block follows it with no prop and no JS. Scoped to the component so installing it
 * alone cannot restyle another highlighter on the page. `.dark` rides along as theme.css accepts it.
 */
const dualThemeStyles = `
[data-slot='install-tabs'] .shiki code span { color: var(--shiki-light); }
[data-theme='dark'] [data-slot='install-tabs'] .shiki code span { color: var(--shiki-dark); }
.dark [data-slot='install-tabs'] .shiki code span { color: var(--shiki-dark); }
`;

const codeTabsListVariants = cva(
  '!border-border relative h-10 w-full justify-between rounded-none border-b bg-surface-subtle px-4 py-0 text-current',
  {
    variants: {
      variant: {
        standard:
          '!border-border relative h-10 w-full justify-between rounded-none border-b bg-surface-subtle px-4 py-0 text-current',
      },
    },
    defaultVariants: {
      variant: 'standard',
    },
  }
);

const codeTabsActiveVariants = cva(
  "rounded-none bg-transparent shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-selected after:content-['']",
  {
    variants: {
      variant: {
        standard:
          "rounded-none bg-transparent shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-selected after:content-['']",
      },
    },
    defaultVariants: {
      variant: 'standard',
    },
  }
);

const codeTabsContentVariants = cva('flex w-full items-center overflow-auto p-4 text-body', {
  variants: {
    variant: {
      standard: 'flex w-full items-center overflow-auto p-4 text-body',
    },
  },
  defaultVariants: {
    variant: 'standard',
  },
});

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
  return Promise.all(
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
  codes?: Record<string, string>;
  items?: CodeTabItem[];
  lang?: string;
  themes?: {
    light: string;
    dark: string;
  };
  theme?: 'light' | 'dark' | 'system';
  copyButton?: boolean;
  onCopy?: (content: string) => void;
  testId?: string;
} & Omit<TabsProps, 'children'> &
  VariantProps<typeof codeTabsVariants>;

function CodeTabs({
  codes,
  items,
  lang = 'bash',
  themes = {
    light: 'github-light',
    dark: 'github-dark-default',
  },
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
  const normalizedItems = React.useMemo<CodeTabItem[]>(() => {
    if (items) {
      return items;
    }
    if (codes) {
      return Object.entries(codes).map(([key, code]) => ({
        id: key,
        label: key,
        code,
      }));
    }
    return [];
  }, [codes, items]);

  const [highlightedItems, setHighlightedItems] = React.useState<CodeTabItem[] | null>(null);
  const [selectedCode, setSelectedCode] = React.useState<string>(value ?? defaultValue ?? normalizedItems[0]?.id ?? '');
  const { dark: darkTheme, light: lightTheme } = themes;

  React.useEffect(() => {
    let cancelled = false;
    highlightCodeTabs({ darkTheme, items: normalizedItems, lang, lightTheme, theme })
      .then((newHighlightedItems) => {
        if (!cancelled) {
          setHighlightedItems(newHighlightedItems);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedItems(createFallbackItems(normalizedItems));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [darkTheme, lang, lightTheme, normalizedItems, theme]);

  const selectedItem = normalizedItems.find((item) => item.id === selectedCode);

  return (
    <Tabs
      className={cn(codeTabsVariants({ variant }), className)}
      data-slot="install-tabs"
      data-testid={testId}
      {...props}
      onValueChange={(val, eventDetails) => {
        setSelectedCode(val);
        onValueChange?.(val, eventDetails);
      }}
      value={selectedCode}
    >
      <style>{dualThemeStyles}</style>
      <TabsList
        activeClassName={codeTabsActiveVariants({ variant })}
        className={codeTabsListVariants({ variant })}
        data-slot="install-tabs-list"
      >
        <div className="flex h-full gap-x-1 overflow-x-auto [scrollbar-width:none] sm:gap-x-2 [&::-webkit-scrollbar]:hidden">
          {highlightedItems?.map((item) => (
            <TabsTrigger
              className="shrink-0 px-2 text-body-sm text-subtle data-[active]:text-selected sm:px-3"
              key={item.id}
              value={item.id}
            >
              {item.label}
            </TabsTrigger>
          ))}
        </div>

        {copyButton && highlightedItems && selectedItem ? (
          <CopyButton
            className="-me-2 bg-transparent hover:bg-accent active:bg-accent-pressed"
            content={selectedItem.code}
            onCopy={onCopy}
            size="sm"
            variant="ghost"
          />
        ) : null}
      </TabsList>
      <TabsContents data-slot="install-tabs-contents">
        {highlightedItems?.map((item) => (
          <TabsContent
            className={codeTabsContentVariants({ variant })}
            data-slot="install-tabs-content"
            key={item.id}
            value={item.id}
          >
            <SanitizedHtml
              className="[&>pre,_&_code]:!bg-transparent [&_code]:!text-body [&>pre,_&_code]:border-none [&>pre,_&_code]:[background:transparent_!important]"
              html={item.code}
            />
          </TabsContent>
        ))}
      </TabsContents>
    </Tabs>
  );
}

export {
  type CodeTabItem,
  CodeTabs,
  type CodeTabsProps,
  codeTabsActiveVariants,
  codeTabsContentVariants,
  codeTabsListVariants,
  codeTabsVariants,
};
