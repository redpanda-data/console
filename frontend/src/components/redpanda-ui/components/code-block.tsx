'use client';

// Copyright 2026 Redpanda Data, Inc.

import { cva, type VariantProps } from 'class-variance-authority';
import { CheckIcon, CopyIcon, WrapTextIcon } from 'lucide-react';
import { type ComponentProps, type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';

import { Button } from './button';
import { useHighlightedCode } from '../lib/use-highlighted-code';
import { cn, type SharedProps } from '../lib/utils';

const codeBlockVariants = cva(
  'group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-lg border text-body has-[>[data-slot=code-block-content]:focus-visible]:ring-[3px] has-[>[data-slot=code-block-content]:focus-visible]:ring-ring/50 data-[size=sm]:text-body-sm',
  {
    variants: {
      variant: {
        default:
          'border-border bg-card text-foreground has-[>[data-slot=code-block-content]:focus-visible]:border-ring',
        destructive: 'border-destructive-line bg-card text-destructive',
        // Paints the default block in the dark theme, which the block sets for itself (`data-theme`),
        // so it reads as a terminal in either app theme. `bg-background`, not `bg-card`: the dark block
        // sets only direct values, and `card` is an alias resolved once at `:root`, so inside this
        // island it would keep the light card. Every other token here is one the dark block sets.
        terminal:
          'border-border bg-background text-foreground has-[>[data-slot=code-block-content]:focus-visible]:border-ring',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type CodeBlockProps = ComponentProps<'div'> &
  VariantProps<typeof codeBlockVariants> &
  SharedProps & {
    /** `sm` is tighter, for tool and log output. @defaultValue 'default' */
    size?: 'default' | 'sm';
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
        'flex min-w-0 shrink-0 items-center gap-2 px-3 pt-3 text-subtle has-[[data-slot=code-block-copy-error]]:flex-wrap *:has-[>[data-slot=code-block-title]]:min-w-0 group-data-[size=sm]/code-block:px-2.5 group-data-[size=sm]/code-block:pt-2.5 group-data-[variant=destructive]/code-block:text-destructive',
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
        "min-w-0 truncate font-medium font-sans text-body text-foreground group-data-[size=sm]/code-block:text-body-sm group-data-[variant=destructive]/code-block:text-destructive [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:inline-block [&_svg]:align-middle *:[svg]:me-1.5",
        className
      )}
      data-slot="code-block-title"
      {...props}
    />
  );
}

export type CodeBlockActionsProps = ComponentProps<'div'>;

/**
 * Sits at the end of a header. Without one, it floats over the block's top end corner. A copy error
 * takes a row of its own: under the header's buttons, or as a bar across the top of the block.
 */
function CodeBlockActions({ className, ...props }: CodeBlockActionsProps) {
  return (
    <div
      className={cn(
        '-my-1 ms-auto -me-1.5 flex shrink-0 items-center gap-1 [[data-slot=code-block-header]>&]:has-[[data-slot=code-block-copy-error]]:contents [[data-slot=code-block-header]>&]:has-[[data-slot=code-block-copy-error]]:*:first:ms-auto [[data-slot=code-block]>&]:absolute [[data-slot=code-block]>&]:end-2 [[data-slot=code-block]>&]:top-2 [[data-slot=code-block]>&]:z-10 [[data-slot=code-block]>&]:m-0 [[data-slot=code-block]>&]:opacity-0 [[data-slot=code-block]>&]:pointer-coarse:opacity-100 [[data-slot=code-block]>&]:transition-opacity [[data-slot=code-block]>&]:group-focus-within/code-block:opacity-100 [[data-slot=code-block]>&]:group-hover/code-block:opacity-100 [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:static [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:flex-wrap [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:justify-end [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:p-2 [[data-slot=code-block]>&]:has-[[data-slot=code-block-copy-error]]:opacity-100 group-data-[size=sm]/code-block:[[data-slot=code-block]>&]:end-1.5 group-data-[size=sm]/code-block:[[data-slot=code-block]>&]:top-1.5 motion-reduce:[[data-slot=code-block]>&]:transition-none [[data-slot=code-block]>&]:*:[button]:bg-background [[data-slot=code-block]>&]:*:[button]:ring-1 [[data-slot=code-block]>&]:*:[button]:ring-foreground/10',
        className
      )}
      data-slot="code-block-actions"
      {...props}
    />
  );
}

const COPY_RESET_MS = 2000;

export type CodeBlockCopyButtonProps = Omit<ComponentProps<typeof Button>, 'value'> & {
  /** The text to copy, or a function that returns it at the moment of the click. */
  value: string | (() => string);
  /** Called once the text is on the clipboard. `event.preventDefault()` in `onClick` skips the copy. */
  onCopied?: () => void;
  /** The button's name, which stays put through copying. @defaultValue 'Copy' */
  copyLabel?: string;
  /** Announced once the text is on the clipboard. @defaultValue 'Copied' */
  copiedLabel?: string;
  /** Shown until the next try, when the clipboard refuses the write. @defaultValue 'Could not copy code. Try again.' */
  copyFailedLabel?: string;
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

      const timeout = setTimeout(() => setState('idle'), COPY_RESET_MS);
      return () => clearTimeout(timeout);
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
        disabled={disabled || state === 'pending'}
        focusableWhenDisabled={state === 'pending'}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            copy();
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
          className="w-full basis-full whitespace-normal break-words rounded-md bg-surface-destructive px-2 py-1 text-body-sm text-destructive-foreground"
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
  label?: string;
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
      className={cn('aria-pressed:bg-accent aria-pressed:text-accent-foreground', className)}
      data-slot="code-block-wrap-button"
      onClick={() => onWrappedChange(!wrapped)}
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
  wrap?: boolean;
  /** Number each `CodeBlockLine`. Put a string's lines in with `CodeBlockLines`. @defaultValue false */
  lineNumbers?: boolean;
  /** The number of the first line, with `lineNumbers`. @defaultValue 1 */
  startLine?: number;
  /**
   * The content takes focus only while it scrolls, so keyboard users can scroll it (WCAG 2.1.1)
   * without every short block becoming a tab stop. Set this to decide yourself.
   */
  tabIndex?: number;
};

/** Whether the `pre` around `code` overflows, rechecked as either resizes. */
function useScrolls() {
  const codeRef = useRef<HTMLElement>(null);
  // Focusable until measured: rendered without script, a block that scrolls stays reachable.
  const [scrolls, setScrolls] = useState(true);

  useEffect(function trackOverflow() {
    const code = codeRef.current;
    const pre = code?.parentElement;
    if (!(code && pre)) {
      return;
    }

    const update = () => setScrolls(pre.scrollWidth > pre.clientWidth || pre.scrollHeight > pre.clientHeight);
    update();
    // The pre resizes with its container; the code element grows as lines arrive or wrap.
    const observer = new ResizeObserver(update);
    observer.observe(pre);
    observer.observe(code);
    return () => observer.disconnect();
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

  return (
    <pre
      className={cn(
        'scroll-fade-x scrollbar-thin data-wrap:scroll-fade-y data-wrap:wrap-break-word min-h-0 min-w-0 overflow-auto px-3 py-3 text-start font-mono leading-relaxed outline-none [counter-reset:line_var(--code-block-start-line)] group-has-data-[slot=code-block-header]/code-block:pt-2 group-has-data-[slot=code-block-footer]/code-block:pb-2 data-wrap:whitespace-pre-wrap group-data-[size=sm]/code-block:px-2.5 group-data-[size=sm]/code-block:py-2.5 group-data-[size=sm]/code-block:group-has-data-[slot=code-block-header]/code-block:pt-1.5',
        className
      )}
      data-numbered={lineNumbers || undefined}
      data-slot="code-block-content"
      data-wrap={wrap || undefined}
      dir="ltr"
      style={{ '--code-block-start-line': startLine - 1, ...style } as CSSProperties}
      tabIndex={tabIndex ?? (scrolls ? 0 : undefined)}
      {...props}
    >
      <code
        className="grid min-h-lh in-data-wrap:min-w-0 min-w-max in-data-numbered:grid-cols-[auto_1fr] content-start"
        data-slot="code-block-code"
        ref={codeRef}
      >
        {children}
      </code>
    </pre>
  );
}

const codeBlockLineVariants = cva(
  // `in-data-wrap:min-w-0`: a line is a grid item, which will not shrink below its content without it,
  // so a URL or long identifier would still overflow a wrapped block.
  "relative in-data-numbered:col-span-2 -mx-3 block in-data-numbered:grid min-h-lh in-data-wrap:min-w-0 in-data-numbered:grid-cols-subgrid in-data-numbered:gap-x-3 px-3 in-data-numbered:[counter-increment:line] before:min-w-6 in-data-numbered:before:select-none before:text-end before:text-subtle in-data-numbered:before:content-[counter(line)] after:absolute after:start-1 after:top-0 after:select-none after:text-subtle group-data-[size=sm]/code-block:-mx-2.5 group-data-[size=sm]/code-block:px-2.5 in-data-numbered:supports-[content:counter(line)_/_'']:before:content-[counter(line)_/_'']",
  {
    variants: {
      variant: {
        default: '',
        added: "bg-success-wash after:text-success after:content-['+']",
        removed: "bg-destructive-wash after:text-destructive after:content-['−']",
        highlighted: 'bg-secondary-wash',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

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
  language?: string;
  /** A line's variant, by its line in `code` counting from 1, whatever the content's `startLine`. */
  variants?: Partial<Record<number, CodeBlockLineProps['variant']>>;
}

/** Every line of `code` as a `CodeBlockLine`, highlighted with `useHighlightedCode`. */
function CodeBlockLines({ code, language = 'text', variants }: CodeBlockLinesProps) {
  const lines = useHighlightedCode(code, language);
  // Line endings as the highlighter splits them, so each line lines up with its highlighted node.
  const source = code.replace(CRLF, '\n').replace(TRAILING_NEWLINE, '');

  return lineStarts(source).map((start, index) => (
    <CodeBlockLine key={start} variant={variants?.[index + 1]}>
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
  allowCopy?: boolean;
  /** Show a toggle that wraps long lines. Copying keeps the source either way. @defaultValue true */
  allowWrap?: boolean;
  className?: string;
  code: string;
  /** `data-testid` for the copy button. @defaultValue `` `${testId}-copy` `` when `testId` is set */
  copyTestId?: string;
  /** Shown before the title. */
  icon?: ReactNode;
  /** Highlights the code. A language the highlighter does not list renders as plain text. */
  language?: string;
  lineNumbers?: boolean;
  /** Caps the content, which then scrolls. @defaultValue 'md' */
  maxHeight?: keyof typeof simpleMaxHeightClasses;
  /** Called once the code is on the clipboard. */
  onCopy?: () => void;
  /** `md` and `lg` are the previous names for `default`. @defaultValue 'default' */
  size?: 'default' | 'sm' | 'md' | 'lg';
  title?: ReactNode;
  variant?: CodeBlockProps['variant'];
  /** @defaultValue 'md' */
  width?: keyof typeof simpleWidthClasses;
  /** Whether long lines start wrapped. The wrap toggle changes it from there. @defaultValue false */
  wrap?: boolean;
}

/** `SimpleCodeBlock`'s header, or its floating actions without a title, visible without a hover. */
function SimpleCodeBlockChrome({ title, icon, buttons }: { title: ReactNode; icon: ReactNode; buttons: ReactNode }) {
  if (title) {
    return (
      <CodeBlockHeader>
        <CodeBlockTitle>
          {icon}
          {title}
        </CodeBlockTitle>
        {buttons ? <CodeBlockActions>{buttons}</CodeBlockActions> : null}
      </CodeBlockHeader>
    );
  }
  // Visible without a hover, as the floating copy button always was.
  return buttons ? (
    <CodeBlockActions className="[[data-slot=code-block]>&]:opacity-100">{buttons}</CodeBlockActions>
  ) : null;
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
  const resolvedCopyTestId = copyTestId ?? (testId ? `${testId}-copy` : undefined);
  const wrapButton = allowWrap ? <CodeBlockWrapButton onWrappedChange={setWrapped} wrapped={wrapped} /> : null;
  const copyButton = allowCopy ? (
    <CodeBlockCopyButton onCopied={onCopy} testId={resolvedCopyTestId} value={code} />
  ) : null;

  return (
    <CodeBlock
      className={cn(simpleWidthClasses[width], className)}
      size={size === 'sm' ? 'sm' : 'default'}
      testId={testId}
      variant={variant}
    >
      <SimpleCodeBlockChrome
        buttons={
          wrapButton || copyButton ? (
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
  codeBlockLineVariants,
  codeBlockVariants,
  SimpleCodeBlock,
};
