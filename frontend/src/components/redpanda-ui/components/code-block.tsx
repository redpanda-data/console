'use client';

import { ScrollArea as ScrollAreaPrimitive, type ScrollAreaViewportProps } from '@base-ui/react/scroll-area';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes, type ReactNode, type RefObject, useCallback, useRef, useState } from 'react';

import { CopyButton } from './copy-button';
import { cn, type SharedProps } from '../lib/utils';

const codeBlockVariants = cva(
  'group fd-codeblock [&.shiki]:!bg-card !border-border relative overflow-hidden rounded-xl border text-sm',
  {
    variants: {
      size: {
        sm: 'my-3 text-xs',
        md: 'my-6 text-sm',
        lg: 'my-8 text-base',
      },
      width: {
        auto: 'w-auto',
        sm: 'w-full max-w-md',
        md: 'w-full max-w-2xl',
        lg: 'w-full max-w-4xl',
        full: 'w-full',
      },
      maxHeight: {
        sm: '[&_[data-slot=scroll-area-viewport]]:max-h-[300px]',
        md: '[&_[data-slot=scroll-area-viewport]]:max-h-[600px]',
        lg: '[&_[data-slot=scroll-area-viewport]]:max-h-[800px]',
        none: '[&_[data-slot=scroll-area-viewport]]:max-h-none',
      },
    },
    defaultVariants: {
      size: 'md',
      width: 'md',
      maxHeight: 'md',
    },
  }
);

export type CodeBlockProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof codeBlockVariants> &
  SharedProps & {
    icon?: ReactNode;
    allowCopy?: boolean;
    viewportProps?: ScrollAreaViewportProps;
    onCopy?: () => void;
  };

export const Pre = forwardRef<HTMLPreElement, HTMLAttributes<HTMLPreElement>>(({ className, ...props }, ref) => (
  <pre
    className={cn(
      'no-scrollbar min-w-0 overflow-x-auto px-4 py-3.5 outline-none has-[[data-slot=tabs]]:p-0 has-[[data-highlighted-line]]:px-0 has-[[data-line-numbers]]:px-0',
      className
    )}
    ref={ref}
    {...props}
  >
    {props.children}
  </pre>
));

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
    ref
  ) => {
    const [isCopied, setIsCopied] = useState(false);
    const areaRef = useRef<HTMLDivElement>(null);

    const onCopy = useCallback(() => {
      const pre = areaRef.current?.getElementsByTagName('pre').item(0);

      if (!pre) {
        return;
      }

      const clone = pre.cloneNode(true) as HTMLElement;

      for (const node of Array.from(clone.querySelectorAll('.nd-copy-ignore'))) {
        node.remove();
      }

      // biome-ignore lint/complexity/noVoid: part of clipboard implementation
      void navigator.clipboard.writeText(clone.textContent ?? '').then(() => {
        setIsCopied(true);
        onCopyEvent?.();
        setTimeout(() => setIsCopied(false), 3000);
      });
    }, [onCopyEvent]);

    return (
      <figure
        data-testid={testId}
        ref={ref}
        {...props}
        className={cn(codeBlockVariants({ size, width, maxHeight }), className)}
      >
        {title ? (
          <div className="!border-border flex h-10 flex-row items-center gap-2 border-b bg-muted px-4">
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
                className="-me-2 bg-transparent selection:bg-selected selection:text-selected-foreground hover:bg-primary/10"
                isCopied={isCopied}
                onClick={onCopy}
                size="sm"
                variant="ghost"
              />
            ) : null}
          </div>
        ) : (
          allowCopy && (
            <CopyButton
              className="absolute top-2 right-2 z-[2] bg-transparent backdrop-blur-md selection:bg-selected selection:text-selected-foreground hover:bg-primary/10"
              isCopied={isCopied}
              onClick={onCopy}
              size="sm"
              variant="ghost"
            />
          )
        )}
        <ScrollAreaPrimitive.Root className="relative" data-slot="scroll-area" dir="ltr">
          <ScrollAreaPrimitive.Viewport
            ref={areaRef as RefObject<HTMLDivElement>}
            {...viewportProps}
            className={cn(
              'size-full rounded-[inherit] outline-none selection:bg-selected selection:text-selected-foreground focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              viewportProps?.className
            )}
            data-slot="scroll-area-viewport"
          >
            {props.children}
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.Scrollbar
            className="flex h-2.5 touch-none select-none flex-col border-t border-t-transparent p-px transition-colors"
            data-slot="scroll-area-scrollbar"
            orientation="horizontal"
          >
            <ScrollAreaPrimitive.Thumb
              className="relative flex-1 rounded-full bg-border"
              data-slot="scroll-area-thumb"
            />
          </ScrollAreaPrimitive.Scrollbar>
          <ScrollAreaPrimitive.Scrollbar
            className="flex h-full w-2.5 touch-none select-none border-l border-l-transparent p-px transition-colors"
            data-slot="scroll-area-scrollbar"
            orientation="vertical"
          >
            <ScrollAreaPrimitive.Thumb
              className="relative flex-1 rounded-full bg-border"
              data-slot="scroll-area-thumb"
            />
          </ScrollAreaPrimitive.Scrollbar>
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
      </figure>
    );
  }
);

CodeBlock.displayName = 'CodeBlock';

// Simplified interface for backend developers
type SimpleCodeBlockProps = {
  code: string;
  language?: string;
  title?: string;
  icon?: ReactNode;
  allowCopy?: boolean;
  size?: 'sm' | 'md' | 'lg';
  width?: 'auto' | 'sm' | 'md' | 'lg' | 'full';
  maxHeight?: 'sm' | 'md' | 'lg' | 'none';
  onCopy?: () => void;
  className?: string;
  testId?: string;
};

export const SimpleCodeBlock = ({
  code,
  language,
  title,
  icon,
  allowCopy = true,
  size = 'md',
  width = 'md',
  maxHeight = 'md',
  onCopy,
  className,
  testId,
}: SimpleCodeBlockProps) => (
  <CodeBlock
    allowCopy={allowCopy}
    className={className}
    icon={icon}
    maxHeight={maxHeight}
    onCopy={onCopy}
    size={size}
    testId={testId}
    title={title}
    width={width}
  >
    <Pre>
      <code className={language}>{code}</code>
    </Pre>
  </CodeBlock>
);

export { codeBlockVariants };
