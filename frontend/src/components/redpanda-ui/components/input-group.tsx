'use client';

// Copyright 2026 Redpanda Data, Inc.

import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';

import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { cn, type SharedProps } from '../lib/utils';

interface InputGroupProps extends React.ComponentProps<'fieldset'>, SharedProps {
  /** A pill URL field or the standard grouped-control corners. */
  shape?: 'default' | 'pill' | undefined;
}

function InputGroup({ className, shape = 'default', testId, ...props }: InputGroupProps) {
  return (
    <fieldset
      className={cn(
        'group/input-group relative flex w-full items-center border !border-input bg-input-fill shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none motion-reduce:transition-none',
        'h-9 min-w-0 has-[>textarea]:h-auto',

        // The group owns the hover fill, so it spans the addons; embedded controls stay transparent.
        // The border yields to the focus and invalid borders instead of outranking them. Match the
        // control's slot, so a hidden input inside an addon (a Switch, a Select) can't switch hover off;
        // `input-group-control` is the slot the docs give a custom control.
        'hover:not-has-[:is([data-slot=input],[data-slot=textarea],[data-slot=input-group-control]):disabled]:bg-input-fill-hover',
        'hover:not-has-[:is([data-slot=input],[data-slot=textarea],[data-slot=input-group-control]):is(:disabled,:focus-visible,[aria-invalid=true])]:!border-input-hover',

        // <Input> wraps its control in a container div, so target the descendant input via [&_input]/has-[input].
        'has-[>[data-align=inline-start]]:[&_input]:pl-2',
        'has-[>[data-align=inline-end]]:[&_input]:pr-2',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:items-stretch has-[>[data-align=block-start]]:[&_input]:pb-3',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:items-stretch has-[>[data-align=block-end]]:[&_input]:pt-3',

        // Target element selectors directly: Input/Textarea overwrite data-slot with their own.
        // State borders are `!important` like the rest border, or `!border-input` outranks them.
        'has-[input:focus-visible]:!border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50',
        'has-[textarea:focus-visible]:!border-ring has-[textarea:focus-visible]:ring-3 has-[textarea:focus-visible]:ring-ring/50',

        'has-[[data-slot][aria-invalid=true]]:!border-destructive has-[[data-slot][aria-invalid=true]]:ring-invalid',

        // A disabled fieldset or `data-disabled` dims the whole group once; its control doesn't dim again.
        'disabled:opacity-50 data-[disabled=true]:opacity-50',
        '[&:is(:disabled,[data-disabled=true])_:is([data-slot=input],[data-slot=textarea],[data-slot=input-group-control])]:opacity-100',
        // A disabled control dims itself, the frame and the text addons, but not enabled buttons: one of them
        // may be what re-enables the control. Match the control's slot, as hover does, not hidden inputs inside an addon.
        // A disabled group's controls match `:disabled` as well, so these wait for an enabled group, or it dims twice.
        'not-disabled:not-data-[disabled=true]:has-[:is([data-slot=input],[data-slot=textarea],[data-slot=input-group-control]):disabled]:!border-input/50 not-disabled:not-data-[disabled=true]:has-[:is([data-slot=input],[data-slot=textarea],[data-slot=input-group-control]):disabled]:bg-input-fill/50',

        shape === 'pill' ? 'rounded-full' : 'rounded-md',
        className
      )}
      data-shape={shape}
      data-slot="input-group"
      data-testid={testId}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center gap-2 py-1.5 text-body font-medium text-subtle select-none group-[:not(:disabled,[data-disabled=true]):has(:is([data-slot=input],[data-slot=textarea],[data-slot=input-group-control]):disabled)]/input-group:text-disabled [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first justify-start pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
        'inline-end': 'order-last justify-end pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]',
        'block-start': 'order-first w-full justify-start px-3 pt-3 group-has-[input]/input-group:pt-2.5',
        'block-end': 'order-last w-full justify-start px-3 pb-3 group-has-[input]/input-group:pb-2.5',
      },
      separator: { false: '', true: '' },
    },
    compoundVariants: [
      { align: 'block-start', separator: true, className: 'border-b pb-3' },
      { align: 'block-end', separator: true, className: 'border-t pt-3' },
    ],
    defaultVariants: {
      align: 'inline-start',
      separator: false,
    },
  }
);

type InputGroupAddonProps = React.ComponentProps<'div'> &
  Omit<VariantProps<typeof inputGroupAddonVariants>, 'separator'> &
  ({ separator?: false | undefined } | { align: 'block-start' | 'block-end'; separator: true });

function InputGroupAddon({ className, align = 'inline-start', separator = false, ...props }: InputGroupAddonProps) {
  return (
    <div
      className={cn(inputGroupAddonVariants({ align, separator }), className)}
      data-align={align}
      data-separator={separator || undefined}
      data-slot="input-group-addon"
      onClick={(e) => {
        if (!(e.target instanceof Node && e.currentTarget.contains(e.target))) {
          return;
        }
        if (e.target instanceof Element && e.target.closest('button') !== null) {
          return;
        }
        const control = e.currentTarget.parentElement?.querySelector('input, textarea');
        if (control instanceof HTMLElement) {
          control.focus();
        }
      }}
      role="presentation"
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva('flex items-center gap-2 text-body shadow-none', {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-[calc(var(--radius)-5px)] px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
      sm: 'h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5',
      'icon-xs': 'size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
      'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
    },
    shape: { default: '', pill: 'rounded-full' },
  },
  defaultVariants: {
    size: 'xs',
    shape: 'default',
  },
});

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  shape = 'default',
  testId,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> & VariantProps<typeof inputGroupButtonVariants> & SharedProps) {
  return (
    <Button
      className={cn(inputGroupButtonVariants({ size, shape }), className)}
      data-size={size}
      shape={shape}
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
        "flex items-center gap-2 text-body text-subtle group-[:not(:disabled,[data-disabled=true]):has(:is([data-slot=input],[data-slot=textarea],[data-slot=input-group-control]):disabled)]/input-group:text-disabled [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function InputGroupInput({ className, testId, ...props }: Omit<React.ComponentProps<'input'>, 'size'> & SharedProps) {
  return <Input appearance="embedded" className={className} containerClassName="flex-1" testId={testId} {...props} />;
}

function InputGroupTextarea({ className, testId, ...props }: React.ComponentProps<'textarea'> & SharedProps) {
  return <Textarea appearance="embedded" className={cn('flex-1', className)} testId={testId} {...props} />;
}

export type { InputGroupAddonProps, InputGroupProps };
export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea };
