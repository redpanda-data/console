'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { CheckIcon, CopyIcon, XIcon } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion } from 'motion/react';
import React from 'react';

import { cn } from '../lib/utils';

const buttonVariants = cva(
  "focus-visible:!border-ring aria-invalid:!border-destructive inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-body outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-invalid motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      // A subset of Button's variants, and each one paints Button's tones — the same name means the
      // same colour in both. `default` is the neutral member, and what a bare CopyButton gets.
      variant: {
        default:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary-hover active:bg-secondary-pressed',
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-pressed',
        destructive:
          'bg-surface-destructive text-destructive-foreground shadow-xs hover:bg-surface-destructive-hover focus-visible:ring-destructive/50 active:bg-surface-destructive-pressed',
        outline:
          '!border-secondary-line hover:!border-secondary-line-hover active:!border-secondary-line-pressed disabled:!border-border border bg-transparent text-secondary shadow-xs hover:bg-secondary-wash active:bg-secondary-wash-pressed disabled:text-disabled',

        ghost:
          'bg-transparent text-secondary hover:bg-secondary-wash active:bg-secondary-wash-pressed disabled:text-disabled',
      },
      size: {
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        md: 'h-9 px-4 py-2 has-[>svg]:px-3',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

const ICONS = { copied: CheckIcon, error: XIcon, idle: CopyIcon } as const;

type CopyButtonProps = Omit<HTMLMotionProps<'button'>, 'onCopy' | 'children'> &
  VariantProps<typeof buttonVariants> & {
    content?: string;
    delay?: number;
    onCopy?: (content: string) => void;
    isCopied?: boolean;
    onCopyChange?: (isCopied: boolean) => void;
    testId?: string;
    children?: React.ReactNode;
  };

function CopyButton({
  content,
  className,
  size,
  variant,
  delay = 3000,
  onClick,
  onCopy,
  isCopied,
  onCopyChange,
  testId,
  children,
  ...props
}: CopyButtonProps) {
  const [localIsCopied, setLocalIsCopied] = React.useState(isCopied ?? false);
  const [isErrored, setIsErrored] = React.useState(false);
  const state = (localIsCopied && 'copied') || (isErrored && 'error') || 'idle';
  const Icon = ICONS[state];
  const resetTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    setLocalIsCopied(isCopied ?? false);
  }, [isCopied]);

  React.useEffect(() => () => clearTimeout(resetTimeout.current), []);

  const scheduleReset = React.useCallback(
    (reset: () => void) => {
      clearTimeout(resetTimeout.current);
      resetTimeout.current = setTimeout(reset, delay);
    },
    [delay]
  );

  const handleIsCopied = React.useCallback(
    (isCopiedState: boolean) => {
      setLocalIsCopied(isCopiedState);
      onCopyChange?.(isCopiedState);
    },
    [onCopyChange]
  );

  const handleCopy = React.useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isCopied) {
        return;
      }
      onClick?.(e);
      if (!content) {
        return;
      }
      try {
        await navigator.clipboard.writeText(content);
        setIsErrored(false);
        handleIsCopied(true);
        scheduleReset(() => handleIsCopied(false));
        onCopy?.(content);
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: needed for copy button implementation
        console.error('Error copying command', error);
        handleIsCopied(false);
        setIsErrored(true);
        scheduleReset(() => setIsErrored(false));
      }
    },
    [isCopied, content, onClick, onCopy, handleIsCopied, scheduleReset]
  );

  return (
    <>
      <motion.button
        aria-label={children ? undefined : 'Copy'}
        className={cn(buttonVariants({ variant, size }), className)}
        data-slot="copy-button"
        data-testid={testId}
        onClick={handleCopy}
        type="button"
        {...props}
      >
        <AnimatePresence mode="wait">
          <motion.span
            animate={{ scale: 1 }}
            data-slot="copy-button-icon"
            data-state={state}
            exit={{ scale: 0 }}
            initial={{ scale: 0 }}
            key={state}
            transition={{ duration: 0.15 }}
          >
            <Icon />
          </motion.span>
        </AnimatePresence>
        {children}
      </motion.button>
      {isErrored ? (
        <span className="sr-only" role="alert">
          Copy failed
        </span>
      ) : null}
    </>
  );
}

export { CopyButton, buttonVariants, type CopyButtonProps };
