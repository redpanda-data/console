'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { cn, type SharedProps } from '../lib/utils';

function InputGroup({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: part of input group implementation
    <div
      className={cn(
        'group/input-group !border-input relative flex w-full items-center rounded-md border shadow-xs outline-none transition-[color,box-shadow] dark:bg-input/30',
        'h-9 min-w-0 has-[>textarea]:h-auto',

        // <Input> wraps its control in a container div, so target the descendant input via [&_input]/has-[input].
        'has-[>[data-align=inline-start]]:[&_input]:pl-2',
        'has-[>[data-align=inline-end]]:[&_input]:pr-2',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:items-stretch has-[>[data-align=block-start]]:[&_input]:pb-3',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:items-stretch has-[>[data-align=block-end]]:[&_input]:pt-3',

        // Target element selectors directly: Input/Textarea overwrite data-slot with their own.
        'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
        'has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/50',

        'has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40',

        className
      )}
      data-slot="input-group"
      data-testid={testId}
      role="group"
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text select-none items-center gap-2 py-1.5 font-medium text-muted-foreground text-sm group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first justify-start pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
        'inline-end': 'order-last justify-end pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]',
        'block-start':
          'order-first w-full justify-start px-3 pt-3 group-has-[input]/input-group:pt-2.5 [.border-b]:pb-3',
        'block-end': 'order-last w-full justify-start px-3 pb-3 group-has-[input]/input-group:pb-2.5 [.border-t]:pt-3',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  }
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: part of input group implementation
    // biome-ignore lint/a11y/useKeyWithClickEvents: click-to-focus convenience matches shadcn (no keyboard handler); interactive controls live inside the addon
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: click-to-focus convenience matches shadcn; interactive controls live inside the addon
    <div
      className={cn(inputGroupAddonVariants({ align }), className)}
      data-align={align}
      data-slot="input-group-addon"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      role="group"
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva('flex items-center gap-2 text-sm shadow-none', {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-[calc(var(--radius)-5px)] px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
      sm: 'h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5',
      'icon-xs': 'size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
      'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
    },
  },
  defaultVariants: {
    size: 'xs',
  },
});

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  testId,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> & VariantProps<typeof inputGroupButtonVariants> & SharedProps) {
  return (
    <Button
      className={cn(inputGroupButtonVariants({ size }), className)}
      data-size={size}
      testId={testId}
      type={type}
      variant={variant}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-muted-foreground text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
        className
      )}
      {...props}
    />
  );
}

function InputGroupInput({ className, testId, ...props }: Omit<React.ComponentProps<'input'>, 'size'> & SharedProps) {
  return (
    <Input
      className={cn(
        'rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
        className
      )}
      containerClassName="flex-1"
      testId={testId}
      {...props}
    />
  );
}

function InputGroupTextarea({ className, testId, ...props }: React.ComponentProps<'textarea'> & SharedProps) {
  return (
    <Textarea
      className={cn(
        'flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent',
        className
      )}
      testId={testId}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea };
