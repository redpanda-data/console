'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import { forwardRef, type HTMLAttributes, type ReactNode, type RefObject, useCallback, useRef, useState } from 'react';

import { CopyButton } from './copy-button';
import { ScrollArea, ScrollBar, ScrollViewport } from './scroll-area';
import { cn } from '../lib/utils';

const codeBlockVariants = cva(
  'not-prose group fd-codeblock relative overflow-hidden rounded-xl border border-border text-sm [&.shiki]:!bg-card',
  {
    variants: {
      size: {
        sm: 'my-3 text-xs',
        default: 'my-6 text-sm',
        lg: 'my-8 text-base',
      },
      width: {
        auto: 'w-auto',
        sm: 'w-full max-w-md',
        default: 'w-full max-w-2xl',
        lg: 'w-full max-w-4xl',
        full: 'w-full',
      },
      maxHeight: {
        sm: '[&_[data-radix-scroll-area-viewport]]:max-h-[300px]',
        default: '[&_[data-radix-scroll-area-viewport]]:max-h-[600px]',
        lg: '[&_[data-radix-scroll-area-viewport]]:max-h-[800px]',
        none: '[&_[data-radix-scroll-area-viewport]]:max-h-none',
      },
    },
    defaultVariants: {
      size: 'default',
      width: 'default',
      maxHeight: 'default',
    },
  },
);

export type CodeBlockProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof codeBlockVariants> & {
    icon?: ReactNode;
    allowCopy?: boolean;
    viewportProps?: ScrollAreaPrimitive.ScrollAreaViewportProps;
    onCopy?: () => void;
    testId?: string;
  };

export const Pre = forwardRef<HTMLPreElement, HTMLAttributes<HTMLPreElement>>(({ className, ...props }, ref) => {
  return (
    <pre
      ref={ref}
      className={cn(
        'not-prose no-scrollbar min-w-0 overflow-x-auto px-4 py-3.5 outline-none has-[[data-highlighted-line]]:px-0 has-[[data-line-numbers]]:px-0 has-[[data-slot=tabs]]:p-0',
        className,
      )}
      {...props}
    >
      {props.children}
    </pre>
  );
});

Pre.displayName = 'Pre';

export const CodeBlock = forwardRef<HTMLElement, CodeBlockProps>(
  (
    {
      title,
      allowCopy = true,
      icon,
      viewportProps,
      onCopy: onCopyEvent,
      size,
      width,
      maxHeight,
      className,
      testId,
      ...props
    },
    ref,
  ) => {
    const [isCopied, setIsCopied] = useState(false);
    const areaRef = useRef<HTMLDivElement>(null);

    const onCopy = useCallback(() => {
      const pre = areaRef.current?.getElementsByTagName('pre').item(0);

      if (!pre) return;

      const clone = pre.cloneNode(true) as HTMLElement;

      clone.querySelectorAll('.nd-copy-ignore').forEach((node) => {
        node.remove();
      });

      // biome-ignore lint/complexity/noVoid: part of clipboard implementation
      void navigator.clipboard.writeText(clone.textContent ?? '').then(() => {
        setIsCopied(true);
        onCopyEvent?.();
        setTimeout(() => setIsCopied(false), 3000);
      });
    }, [onCopyEvent]);

    return (
      <figure
        ref={ref}
        data-testid={testId}
        {...props}
        className={cn(codeBlockVariants({ size, width, maxHeight }), className)}
      >
        {title ? (
          <div className="flex flex-row items-center gap-2 bg-muted border-b border-border px-4 h-10">
            {icon ? (
              <div
                className="text-muted-foreground [&_svg]:size-3.5"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: no XSS attacks
                // biome-ignore lint/security/noDangerouslySetInnerHtmlWithChildren: no XSS attacks
                dangerouslySetInnerHTML={typeof icon === 'string' ? { __html: icon } : undefined}
              >
                {typeof icon !== 'string' ? icon : null}
              </div>
            ) : null}
            <figcaption className="flex-1 truncate text-muted-foreground">{title}</figcaption>
            {allowCopy ? (
              <CopyButton
                size="sm"
                variant="ghost"
                className="-me-2 bg-transparent hover:bg-primary/10 selection:bg-selected selection:text-selected-foreground"
                onClick={onCopy}
                isCopied={isCopied}
              />
            ) : null}
          </div>
        ) : (
          allowCopy && (
            <CopyButton
              size="sm"
              variant="ghost"
              className="absolute right-2 top-2 z-[2] backdrop-blur-md bg-transparent hover:bg-primary/10 selection:bg-selected selection:text-selected-foreground"
              onClick={onCopy}
              isCopied={isCopied}
            />
          )
        )}
        <ScrollArea dir="ltr">
          <ScrollViewport
            ref={areaRef as RefObject<HTMLDivElement>}
            {...viewportProps}
            className={cn('selection:bg-selected selection:text-selected-foreground', viewportProps?.className)}
          >
            {props.children}
          </ScrollViewport>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </figure>
    );
  },
);

CodeBlock.displayName = 'CodeBlock';

// Simplified interface for backend developers
interface SimpleCodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  icon?: ReactNode;
  allowCopy?: boolean;
  size?: 'sm' | 'default' | 'lg';
  width?: 'auto' | 'sm' | 'default' | 'lg' | 'full';
  maxHeight?: 'sm' | 'default' | 'lg' | 'none';
  onCopy?: () => void;
  className?: string;
  testId?: string;
}

export const SimpleCodeBlock = ({
  code,
  language,
  title,
  icon,
  allowCopy = true,
  size = 'default',
  width = 'default',
  maxHeight = 'default',
  onCopy,
  className,
  testId,
}: SimpleCodeBlockProps) => {
  return (
    <CodeBlock
      title={title}
      icon={icon}
      allowCopy={allowCopy}
      size={size}
      width={width}
      maxHeight={maxHeight}
      onCopy={onCopy}
      className={className}
      testId={testId}
    >
      <Pre>
        <code className={language}>{code}</code>
      </Pre>
    </CodeBlock>
  );
};

export { codeBlockVariants };
