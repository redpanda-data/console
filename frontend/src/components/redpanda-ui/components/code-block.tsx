'use client';

// Copyright 2026 Redpanda Data, Inc.

import type { VariantProps } from 'class-variance-authority';
import { CheckIcon, CopyIcon, WrapTextIcon } from 'lucide-react';
import { type ComponentProps, type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { useHighlightedCodeState } from '../lib/use-highlighted-code';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';
import { codeBlockLineVariants, codeBlockVariants } from './code-block/variants';

export type CodeBlockProps = ComponentProps<'div'> &
  VariantProps<typeof codeBlockVariants> &
  SharedProps & {
    /** `sm` is tighter, for tool and log output. @defaultValue 'default' */
    size?: 'default' | 'sm' | undefined;
  };

function CodeBlock({ className, variant = 'default', size = 'default', testId, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(codeBlockVariants({ variant }), className)}
      data-size={size}
      data-slot="code-block"
      data-testid={testId}
      data-theme={variant === 'terminal' ? 'dark' : undefined}
      data-variant={variant}
      {...props}
    />
  );
}

export type CodeBlockHeaderProps = ComponentProps<'div'>;

function CodeBlockHeader({ className, ...props }: CodeBlockHeaderProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-2 px-3 pt-3 text-subtle group-data-[size=sm]/code-block:px-2.5 group-data-[size=sm]/code-block:pt-2.5 group-data-[variant=destructive]/code-block:text-destructive *:has-[>[data-slot=code-block-title]]:min-w-0 has-[[data-slot=code-block-copy-error]]:flex-wrap',
        className
      )}
      data-slot="code-block-header"
      {...props}
    />
  );
}

export type CodeBlockTitleProps = ComponentProps<'div'>;

function CodeBlockTitle({ className, ...props }: CodeBlockTitleProps) {
  return (
    <div
      className={cn(
        "min-w-0 truncate font-sans text-body font-medium text-foreground group-data-[size=sm]/code-block:text-body-sm group-data-[variant=destructive]/code-block:text-destructive [&_svg]:pointer-events-none [&_svg]:inline-block [&_svg]:align-middle [&_svg:not([class*='size-'])]:size-3.5 *:[svg]:me-1.5",
        className
      )}
      data-slot="code-block-title"
      {...props}
    />
  );
}

export type CodeBlockActionsProps = ComponentProps<'div'> & {
  /** Floating controls appear on hover or focus unless set to `always`. @defaultValue 'hover' */
  visibility?: 'hover' | 'always' | undefined;
};

/**
 * Sits at the end of a header. Without one, it floats over the block's top end corner. A copy error
 * takes a row of its own: under the header's buttons, or as a bar across the top of the block.
 */
function CodeBlockActions({ className, visibility = 'hover', ...props }: CodeBlockActionsProps) {
  return (
    <div
      className={cn(
        '-my-1 ms-auto -me-1.5 flex shrink-0 items-center gap-1 [[data-slot=code-block-header]>&]:has-[[data-slot=code-block-copy-error]]:contents [[data-slot=code-block-header]>&]:has-[[data-slot=code-block-copy-error]]:*:first:ms-auto [[data-slot=code-block]>&]:absolute [[data-slot=code-block]>&]:inset-e-2 [[data-slot=code-block]>&]:top-2 [[data-slot=code-block]>&]:z-10 [[data-slot=code-block]>&]:m-0 [[data-slot=code-block]>&]:opacity-0 [[data-slot=code-block]>&]:transition-opacity [[data-slot=code-block]>&]:group-focus-within/code-block:opacity-100 [[data-slot=code-block]>&]:group-hover/code-block:opacity-100 group-data-[size=sm]/code-block:[[data-slot=code-block]>&]:inset-e-1.5 group-data-[size=sm]/code-block:[[data-slot=code-block]>&]:top-1.5 [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:static [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:flex-wrap [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:justify-end [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:p-2 [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:opacity-100 motion-reduce:[[data-slot=code-block]>&]:transition-none [[data-slot=code-block]>&]:pointer-coarse:opacity-100 [[data-slot=code-block]>&]:*:[button]:bg-background [[data-slot=code-block]>&]:*:[button]:ring-1 [[data-slot=code-block]>&]:*:[button]:ring-foreground/10',
        '[[data-slot=code-block]>&]:data-[visibility=always]:opacity-100',
        className
      )}
      data-slot="code-block-actions"
      data-visibility={visibility}
      {...props}
    />
  );
}

const COPY_RESET_MS = 2000;

export type CodeBlockCopyButtonProps = Omit<ComponentProps<typeof Button>, 'value'> & {
  /** The text to copy, or a function that returns it at the moment of the click. */
  value: string | (() => string);
  /** Called once the text is on the clipboard. `event.preventDefault()` in `onClick` skips the copy. */
  onCopied?: (() => void) | undefined;
  /** The button's name, which stays put through copying. @defaultValue 'Copy' */
  copyLabel?: string | undefined;
  /** Announced once the text is on the clipboard. @defaultValue 'Copied' */
  copiedLabel?: string | undefined;
  /** Shown until the next try, when the clipboard refuses the write. @defaultValue 'Could not copy code. Try again.' */
  copyFailedLabel?: string | undefined;
};

function CodeBlockCopyButton({
  value,
  onCopied,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  copyFailedLabel = 'Could not copy code. Try again.',
  variant = 'ghost',
  size = 'icon-xs',
  disabled,
  onClick,
  ...props
}: CodeBlockCopyButtonProps) {
  const [state, setState] = useState<'idle' | 'pending' | 'copied' | 'failed'>('idle');

  // Only success fades: a failure stays until the next try, so it cannot be missed.
  useEffect(
    function resetCopied() {
      if (state !== 'copied') {
        return;
      }

      const timeout = setTimeout(() => {
        setState('idle');
      }, COPY_RESET_MS);
      return () => {
        clearTimeout(timeout);
      };
    },
    [state]
  );

  const copy = async () => {
    setState('pending');
    try {
      await navigator.clipboard.writeText(typeof value === 'function' ? value() : value);
    } catch {
      setState('failed');
      return;
    }
    setState('copied');
    onCopied?.();
  };

  return (
    <>
      <Button
        aria-busy={state === 'pending' || undefined}
        // The name stays put: renaming a focused button would announce the result a second time.
        aria-label={copyLabel}
        data-copied={state === 'copied' || undefined}
        data-copy-failed={state === 'failed' || undefined}
        data-slot="code-block-copy-button"
        // Held still while the write is pending, without dropping keyboard focus.
        disabled={disabled === true ? disabled : state === 'pending'}
        focusableWhenDisabled={state === 'pending'}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            copy().catch(() => {
              setState('failed');
            });
          }
        }}
        size={size}
        type="button"
        variant={variant}
        {...props}
      >
        {state === 'copied' ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </Button>
      <span className="sr-only" role="status">
        {state === 'copied' ? copiedLabel : ''}
      </span>
      {state === 'failed' ? (
        <span
          className="w-full basis-full rounded-md bg-surface-destructive px-2 py-1 text-body-sm wrap-break-word whitespace-normal text-destructive-foreground"
          data-slot="code-block-copy-error"
          role="alert"
        >
          {copyFailedLabel}
        </span>
      ) : null}
    </>
  );
}

const CRLF = /\r\n?/g;
export type CodeBlockWrapButtonProps = Omit<ComponentProps<typeof Button>, 'onClick' | 'aria-pressed'> & {
  wrapped: boolean;
  onWrappedChange: (wrapped: boolean) => void;
  /** @defaultValue 'Wrap lines' */
  label?: string | undefined;
};

/** A toggle for `CodeBlockContent`'s `wrap`. It changes the display only; copying keeps the source. */
function CodeBlockWrapButton({
  wrapped,
  onWrappedChange,
  label = 'Wrap lines',
  variant = 'ghost',
  size = 'icon-xs',
  className,
  ...props
}: CodeBlockWrapButtonProps) {
  return (
    <Button
      aria-label={label}
      aria-pressed={wrapped}
      className={className}
      data-slot="code-block-wrap-button"
      onClick={() => {
        onWrappedChange(!wrapped);
      }}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      <WrapTextIcon aria-hidden="true" />
    </Button>
  );
}

const TRAILING_NEWLINE = /\n$/;

/**
 * Where each line of `code` starts. That offset is a line's identity: unique, and unchanged as more
 * code streams in after it, so a finished line keeps its node.
 */
function lineStarts(code: string): number[] {
  const starts = [0];
  for (let at = code.indexOf('\n'); at !== -1; at = code.indexOf('\n', at + 1)) {
    starts.push(at + 1);
  }
  return starts;
}

export type CodeBlockContentProps = ComponentProps<'pre'> & {
  /** Wrap long lines instead of scrolling them. @defaultValue false */
  wrap?: boolean | undefined;
  /** Number each `CodeBlockLine`. Put a string's lines in with `CodeBlockLines`. @defaultValue false */
  lineNumbers?: boolean | undefined;
  /** The number of the first line, with `lineNumbers`. @defaultValue 1 */
  startLine?: number | undefined;
  /**
   * The content takes focus only while it scrolls, so keyboard users can scroll it (WCAG 2.1.1)
   * without every short block becoming a tab stop. Set this to decide yourself.
   */
  tabIndex?: number | undefined;
};

/** Whether the `pre` around `code` overflows, rechecked as either resizes. */
function useScrolls() {
  const codeRef = useRef<HTMLElement>(null);
  // Focusable until measured: rendered without script, a block that scrolls stays reachable.
  const [scrolls, setScrolls] = useState(true);

  useEffect(function trackOverflow() {
    const code = codeRef.current;
    const pre = code?.parentElement;
    if (!(code !== null && pre !== undefined && pre !== null)) {
      return;
    }

    const update = () => {
      setScrolls(pre.scrollWidth > pre.clientWidth || pre.scrollHeight > pre.clientHeight);
    };
    update();
    // The pre resizes with its container; the code element grows as lines arrive or wrap.
    const observer = new ResizeObserver(update);
    observer.observe(pre);
    observer.observe(code);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { codeRef, scrolls };
}

function CodeBlockContent({
  className,
  children,
  style,
  wrap = false,
  lineNumbers = false,
  startLine = 1,
  tabIndex,
  ...props
}: CodeBlockContentProps) {
  const { codeRef, scrolls } = useScrolls();

  const contentStyle = { '--code-block-start-line': startLine - 1, ...style } satisfies CSSProperties & {
    '--code-block-start-line': number;
  };

  return (
    <pre
      className={cn(
        'min-h-0 min-w-0 scroll-fade-x scrollbar-thin overflow-auto p-3 text-start font-mono leading-relaxed outline-none [counter-reset:line_var(--code-block-start-line)] group-has-data-[slot=code-block-footer]/code-block:pb-2 group-has-data-[slot=code-block-header]/code-block:pt-2 group-data-[size=sm]/code-block:p-2.5 group-data-[size=sm]/code-block:group-has-data-[slot=code-block-header]/code-block:pt-1.5 data-wrap:scroll-fade-y data-wrap:wrap-break-word data-wrap:whitespace-pre-wrap',
        className
      )}
      data-numbered={lineNumbers || undefined}
      data-slot="code-block-content"
      data-wrap={wrap || undefined}
      dir="ltr"
      style={contentStyle}
      tabIndex={tabIndex ?? (scrolls ? 0 : undefined)}
      {...props}
    >
      <code
        className="grid min-h-lh min-w-max content-start in-data-numbered:grid-cols-[auto_1fr] in-data-wrap:min-w-0"
        data-slot="code-block-code"
        ref={codeRef}
      >
        {children}
      </code>
    </pre>
  );
}

export type CodeBlockLineProps = ComponentProps<'span'> & VariantProps<typeof codeBlockLineVariants>;

function CodeBlockLine({ className, variant = 'default', children, ...props }: CodeBlockLineProps) {
  // An empty line holds a newline so copying a selection keeps blank lines.
  const empty =
    children === undefined ||
    children === null ||
    children === '' ||
    (Array.isArray(children) && children.length === 0);

  return (
    <span
      className={cn(codeBlockLineVariants({ variant }), className)}
      data-slot="code-block-line"
      data-variant={variant}
      {...props}
    >
      <span className="min-w-0" data-slot="code-block-line-content">
        {empty ? '\n' : children}
      </span>
    </span>
  );
}

export interface CodeBlockLinesProps {
  code: string;
  /** Highlights the lines. Without one, or for a language the highlighter does not list, they stay plain. */
  language?: string | undefined;
  /** A line's variant, by its line in `code` counting from 1, whatever the content's `startLine`. */
  variants?: Partial<Record<number, CodeBlockLineProps['variant']>> | undefined;
}

/** Every line of `code` as a `CodeBlockLine`, highlighted with `useHighlightedCode`. */
function CodeBlockLines({ code, language = 'text', variants }: CodeBlockLinesProps) {
  const { lines, pending } = useHighlightedCodeState(code, language);
  // Line endings as the highlighter splits them, so each line lines up with its highlighted node.
  const source = code.replace(CRLF, '\n').replace(TRAILING_NEWLINE, '');

  return lineStarts(source).map((start, index) => (
    <CodeBlockLine data-highlight-pending={pending || undefined} key={start} variant={variants?.[index + 1]}>
      {lines[index]}
    </CodeBlockLine>
  ));
}

export type CodeBlockFooterProps = ComponentProps<'div'>;

function CodeBlockFooter({ className, ...props }: CodeBlockFooterProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-2 px-3 pb-3 text-subtle group-data-[size=sm]/code-block:px-2.5 group-data-[size=sm]/code-block:pb-2.5',
        className
      )}
      data-slot="code-block-footer"
      {...props}
    />
  );
}

const simpleWidthClasses = {
  auto: 'w-auto',
  sm: 'w-full max-w-md',
  md: 'w-full max-w-2xl',
  lg: 'w-full max-w-4xl',
  full: 'w-full',
} as const;

const simpleMaxHeightClasses = {
  sm: 'max-h-[300px]',
  md: 'max-h-[600px]',
  lg: 'max-h-[800px]',
  none: 'max-h-none',
} as const;

export interface SimpleCodeBlockProps extends SharedProps {
  /** @defaultValue true */
  allowCopy?: boolean | undefined;
  /** Show a toggle that wraps long lines. Copying keeps the source either way. @defaultValue true */
  allowWrap?: boolean | undefined;
  className?: string | undefined;
  code: string;
  /** `data-testid` for the copy button. @defaultValue `` `${testId}-copy` `` when `testId` is set */
  copyTestId?: string | undefined;
  /** Shown before the title. */
  icon?: ReactNode | undefined;
  /** Highlights the code. A language the highlighter does not list renders as plain text. */
  language?: string | undefined;
  lineNumbers?: boolean | undefined;
  /** Caps the content, which then scrolls. @defaultValue 'md' */
  maxHeight?: keyof typeof simpleMaxHeightClasses | undefined;
  /** Called once the code is on the clipboard. */
  onCopy?: (() => void) | undefined;
  /** @defaultValue 'default' */
  size?: 'default' | 'sm' | undefined;
  title?: ReactNode | undefined;
  variant?: CodeBlockProps['variant'] | undefined;
  /** @defaultValue 'md' */
  width?: keyof typeof simpleWidthClasses | undefined;
  /** Whether long lines start wrapped. The wrap toggle changes it from there. @defaultValue false */
  wrap?: boolean | undefined;
}

/** `SimpleCodeBlock`'s header, or its floating actions without a title, visible without a hover. */
function SimpleCodeBlockChrome({ title, icon, buttons }: { title: ReactNode; icon: ReactNode; buttons: ReactNode }) {
  if (hasSlotContent(title)) {
    return (
      <CodeBlockHeader>
        <CodeBlockTitle>
          {icon}
          {title}
        </CodeBlockTitle>
        {hasSlotContent(buttons) ? <CodeBlockActions>{buttons}</CodeBlockActions> : null}
      </CodeBlockHeader>
    );
  }
  // Visible without a hover, as the floating copy button always was.
  return hasSlotContent(buttons) ? <CodeBlockActions visibility="always">{buttons}</CodeBlockActions> : null;
}

/** A complete block from a string: highlighting, an optional title, and wrap and copy buttons. */
function SimpleCodeBlock({
  code,
  language = 'text',
  title,
  icon,
  allowCopy = true,
  allowWrap = true,
  onCopy,
  lineNumbers = false,
  wrap = false,
  variant,
  size = 'default',
  width = 'md',
  maxHeight = 'md',
  className,
  testId,
  copyTestId,
}: SimpleCodeBlockProps) {
  const [wrapped, setWrapped] = useState(wrap);
  const resolvedCopyTestId = copyTestId ?? (testId !== undefined && testId !== '' ? `${testId}-copy` : undefined);
  const wrapButton = allowWrap ? <CodeBlockWrapButton onWrappedChange={setWrapped} wrapped={wrapped} /> : null;
  const copyButton = allowCopy ? (
    <CodeBlockCopyButton onCopied={onCopy} testId={resolvedCopyTestId} value={code} />
  ) : null;

  return (
    <CodeBlock className={cn(simpleWidthClasses[width], className)} size={size} testId={testId} variant={variant}>
      <SimpleCodeBlockChrome
        buttons={
          wrapButton !== null || copyButton !== null ? (
            <>
              {wrapButton}
              {copyButton}
            </>
          ) : null
        }
        icon={icon}
        title={title}
      />
      <CodeBlockContent className={simpleMaxHeightClasses[maxHeight]} lineNumbers={lineNumbers} wrap={wrapped}>
        <CodeBlockLines code={code} language={language} />
      </CodeBlockContent>
    </CodeBlock>
  );
}

export {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFooter,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockLines,
  CodeBlockTitle,
  CodeBlockWrapButton,
  SimpleCodeBlock,
};
