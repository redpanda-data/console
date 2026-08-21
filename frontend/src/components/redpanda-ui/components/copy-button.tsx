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
      variant: {
        primary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary-hover active:bg-secondary-pressed',
        destructive:
          'bg-surface-destructive text-destructive-foreground shadow-xs hover:bg-surface-destructive-hover focus-visible:ring-destructive/50 active:bg-surface-destructive-pressed',
        outline:
          '!border-primary-line hover:!border-primary-line-hover active:!border-primary-line-pressed disabled:!border-border border text-primary shadow-xs hover:bg-primary-wash active:bg-primary-wash-pressed disabled:text-disabled',
        secondary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-pressed',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:bg-accent-pressed',
      },
      size: {
        md: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

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
  /**
   * A clipboard write can be refused — no permission, no secure context, a headless environment —
   * and reporting only to the console leaves the button sitting on its rest icon, which reads as
   * "nothing happened" and is indistinguishable from a click that missed. So failure mirrors success:
   * an icon swap and a destructive tone for `delay`, plus a live region because the icon alone is not
   * announced. `onCopy` stays a success-only callback.
   */
  const [isErrored, setIsErrored] = React.useState(false);
  const Icon = localIsCopied ? CheckIcon : isErrored ? XIcon : CopyIcon;

  React.useEffect(() => {
    setLocalIsCopied(isCopied ?? false);
  }, [isCopied]);

  const handleIsCopied = React.useCallback(
    (isCopiedState: boolean) => {
      setLocalIsCopied(isCopiedState);
      onCopyChange?.(isCopiedState);
    },
    [onCopyChange]
  );

  const handleCopy = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isCopied) {
        return;
      }
      if (content) {
        navigator.clipboard
          .writeText(content)
          .then(() => {
            setIsErrored(false);
            handleIsCopied(true);
            setTimeout(() => handleIsCopied(false), delay);
            onCopy?.(content);
          })
          .catch((error) => {
            // biome-ignore lint/suspicious/noConsole: needed for copy button implementation
            console.error('Error copying command', error);
            setIsErrored(true);
            setTimeout(() => setIsErrored(false), delay);
          });
      }
      onClick?.(e);
    },
    [isCopied, content, delay, onClick, onCopy, handleIsCopied]
  );

  return (
    <motion.button
      className={cn(buttonVariants({ variant, size }), isErrored && 'text-destructive', className)}
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
          exit={{ scale: 0 }}
          initial={{ scale: 0 }}
          key={localIsCopied ? 'check' : isErrored ? 'error' : 'copy'}
          transition={{ duration: 0.15 }}
        >
          <Icon />
        </motion.span>
      </AnimatePresence>
      {isErrored && (
        <span className="sr-only" role="alert">
          Copy failed
        </span>
      )}
      {children}
    </motion.button>
  );
}

export { CopyButton, buttonVariants, type CopyButtonProps };
