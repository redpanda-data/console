'use client';

// Copyright 2026 Redpanda Data, Inc.

import type { VariantProps } from 'class-variance-authority';
import { CheckIcon, CopyIcon, XIcon } from 'lucide-react';
import { AnimatePresence, domMax, type HTMLMotionProps, LazyMotion } from 'motion/react';
import { button as MotionButton, span as MotionSpan } from 'motion/react-m';
import React from 'react';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn } from '../lib/utils';
import { buttonVariants } from './copy-button/variants';

const ICONS = { copied: CheckIcon, error: XIcon, idle: CopyIcon } as const;

type CopyButtonProps = Omit<HTMLMotionProps<'button'>, 'onCopy' | 'children'> &
  VariantProps<typeof buttonVariants> & {
    content?: string | undefined;
    delay?: number | undefined;
    onCopy?: ((content: string) => void) | undefined;
    isCopied?: boolean | undefined;
    onCopyChange?: ((isCopied: boolean) => void) | undefined;
    testId?: string | undefined;
    children?: React.ReactNode | undefined;
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
  const [localIsCopied, setLocalIsCopied] = React.useState(false);
  const [isErrored, setIsErrored] = React.useState(false);
  const copied = isCopied ?? localIsCopied;
  let state: keyof typeof ICONS = 'idle';
  if (copied) {
    state = 'copied';
  }
  if (isErrored) {
    state = 'error';
  }
  const Icon = ICONS[state];
  const resetTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(function clearCopyResetOnUnmount() {
    return () => {
      clearTimeout(resetTimeout.current);
    };
  }, []);

  const scheduleReset = (reset: () => void) => {
    clearTimeout(resetTimeout.current);
    resetTimeout.current = setTimeout(reset, delay);
  };

  const handleIsCopied = (isCopiedState: boolean) => {
    if (isCopied === undefined) {
      setLocalIsCopied(isCopiedState);
    }
    onCopyChange?.(isCopiedState);
  };

  const handleCopyFailure = () => {
    setLocalIsCopied(false);
    setIsErrored(true);
    scheduleReset(() => {
      setIsErrored(false);
    });
  };

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!(content !== undefined && content !== '')) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      handleCopyFailure();
      handleIsCopied(false);
      return;
    }
    setIsErrored(false);
    handleIsCopied(true);
    scheduleReset(() => {
      handleIsCopied(false);
    });
    onCopy?.(content);
  };

  return (
    <LazyMotion features={domMax}>
      <MotionButton
        aria-label={hasSlotContent(children) ? undefined : 'Copy'}
        className={cn(buttonVariants({ variant, size }), className)}
        data-slot="copy-button"
        data-testid={testId}
        onClick={(event) => {
          handleCopy(event).catch(handleCopyFailure);
        }}
        type="button"
        {...props}
      >
        <AnimatePresence mode="wait">
          <MotionSpan
            animate={{ scale: 1 }}
            data-slot="copy-button-icon"
            data-state={state}
            exit={{ scale: 0 }}
            initial={{ scale: 0 }}
            key={state}
            transition={{ duration: 0.15 }}
          >
            <Icon />
          </MotionSpan>
        </AnimatePresence>
        {children}
      </MotionButton>
      {isErrored ? (
        <span className="sr-only" role="alert">
          Copy failed
        </span>
      ) : null}
    </LazyMotion>
  );
}

export { CopyButton, type CopyButtonProps };
