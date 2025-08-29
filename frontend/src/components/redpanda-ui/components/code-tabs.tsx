'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { CopyButton } from './copy-button';
import { Tabs, TabsContent, TabsContents, TabsList, type TabsProps, TabsTrigger } from './tabs';
import { cn } from '../lib/utils';

const codeTabsVariants = cva('w-full gap-0 bg-card rounded-xl border overflow-hidden', {
  variants: {
    variant: {
      default: 'w-full gap-0 bg-card rounded-xl border overflow-hidden',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const codeTabsListVariants = cva(
  'w-full relative justify-between rounded-none h-10 bg-muted border-b border-border text-current py-0 px-4',
  {
    variants: {
      variant: {
        default:
          'w-full relative justify-between rounded-none h-10 bg-muted border-b border-border text-current py-0 px-4',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const codeTabsActiveVariants = cva(
  "rounded-none shadow-none bg-transparent after:content-[''] after:absolute after:inset-x-0 after:h-0.5 after:bottom-0 after:bg-selected after:rounded-t-full",
  {
    variants: {
      variant: {
        default:
          "rounded-none shadow-none bg-transparent after:content-[''] after:absolute after:inset-x-0 after:h-0.5 after:bottom-0 after:bg-selected after:rounded-t-full",
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const codeTabsContentVariants = cva('w-full text-sm flex items-center p-4 overflow-auto', {
  variants: {
    variant: {
      default: 'w-full text-sm flex items-center p-4 overflow-auto',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type CodeTabsProps = {
  codes: Record<string, string>;
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
  lang = 'bash',
  themes = {
    light: 'github-light',
    dark: 'github-dark',
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
  const [highlightedCodes, setHighlightedCodes] = React.useState<Record<string, string> | null>(null);
  const [selectedCode, setSelectedCode] = React.useState<string>(value ?? defaultValue ?? Object.keys(codes)[0] ?? '');

  React.useEffect(() => {
    async function loadHighlightedCode() {
      try {
        const { codeToHtml } = await import('shiki');
        const newHighlightedCodes: Record<string, string> = {};

        for (const [command, val] of Object.entries(codes)) {
          const highlighted = await codeToHtml(val, {
            lang,
            themes: {
              light: themes.light,
              dark: themes.dark,
            },
            defaultColor: theme === 'dark' ? 'dark' : 'light',
          });

          newHighlightedCodes[command] = highlighted;
        }

        setHighlightedCodes(newHighlightedCodes);
      } catch (error) {
        console.error('Error highlighting codes', error);
        setHighlightedCodes(codes);
      }
    }
    loadHighlightedCode();
  }, [theme, lang, themes.light, themes.dark, codes]);

  return (
    <Tabs
      data-slot="install-tabs"
      data-testid={testId}
      className={cn(codeTabsVariants({ variant }), className)}
      {...props}
      value={selectedCode}
      onValueChange={(val) => {
        setSelectedCode(val);
        onValueChange?.(val);
      }}
    >
      <TabsList
        data-slot="install-tabs-list"
        className={codeTabsListVariants({ variant })}
        activeClassName={codeTabsActiveVariants({ variant })}
      >
        <div className="flex gap-x-3 h-full">
          {highlightedCodes &&
            Object.keys(highlightedCodes).map((code) => (
              <TabsTrigger
                key={code}
                value={code}
                className="text-muted-foreground data-[state=active]:text-selected px-0"
              >
                {code}
              </TabsTrigger>
            ))}
        </div>

        {copyButton && highlightedCodes && (
          <CopyButton
            content={codes[selectedCode]}
            size="sm"
            variant="ghost"
            className="-me-2 bg-transparent hover:bg-selected/10"
            onCopy={onCopy}
          />
        )}
      </TabsList>
      <TabsContents data-slot="install-tabs-contents">
        {highlightedCodes &&
          Object.entries(highlightedCodes).map(([code, val]) => (
            <TabsContent
              data-slot="install-tabs-content"
              key={code}
              className={codeTabsContentVariants({ variant })}
              value={code}
            >
              <div
                className="[&>pre,_&_code]:!bg-transparent [&>pre,_&_code]:[background:transparent_!important] [&>pre,_&_code]:border-none [&_code]:!text-[13px]"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: part of code tabs implementation
                dangerouslySetInnerHTML={{ __html: val }}
              />
            </TabsContent>
          ))}
      </TabsContents>
    </Tabs>
  );
}

export {
  CodeTabs,
  codeTabsVariants,
  codeTabsListVariants,
  codeTabsActiveVariants,
  codeTabsContentVariants,
  type CodeTabsProps,
};
