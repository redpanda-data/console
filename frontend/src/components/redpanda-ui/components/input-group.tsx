'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { cn } from '../lib/utils';

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [hasBlockAlign, setHasBlockAlign] = React.useState(false);

  React.useEffect(() => {
    if (ref.current) {
      const blockAddon = ref.current.querySelector('[data-align="block-start"], [data-align="block-end"]');
      setHasBlockAlign(!!blockAddon);
    }
  }, []);

  return (
    <div
      ref={ref}
      data-slot="input-group"
      role="group"
      className={cn(
        'group/input-group border-input dark:bg-input/30 relative flex w-full rounded-md border shadow-xs transition-[color,box-shadow] outline-none',
        'h-9 min-w-0 has-[>textarea]:h-auto',

        // Conditional alignment
        hasBlockAlign ? 'h-auto flex-col items-stretch' : 'items-center',

        // Variants based on alignment.
        'has-[>[data-align=inline-start]]:[&>input]:pl-2',
        'has-[>[data-align=inline-end]]:[&>input]:pr-2',
        'has-[>[data-align=block-start]]:[&>input]:pb-3',
        'has-[>[data-align=block-end]]:[&>input]:pt-3',

        // Focus state.
        'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot=input-group-control]:focus-visible]:ring-[3px]',

        // Error state.
        'has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40',

        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "text-muted-foreground flex h-auto cursor-text items-center gap-2 py-1.5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50",
  {
    variants: {
      align: {
        'inline-start': 'order-first justify-start pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
        'inline-end': 'order-last justify-end pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]',
        'block-start':
          'order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3 group-has-[>input]/input-group:pt-2.5',
        'block-end': 'order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3 group-has-[>input]/input-group:pb-2.5',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  },
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva('text-sm shadow-none flex gap-2 items-center', {
  variants: {
    size: {
      xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
      sm: 'h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5',
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
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> & VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'size'>) {
  return (
    <div className="flex-1">
      <Input
        data-slot="input-group-control"
        className={cn(
          'rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
          className,
        )}
        {...props}
      />
    </div>
  );
}

const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <Textarea
        ref={ref}
        data-slot="input-group-control"
        className={cn(
          'flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent',
          className,
        )}
        {...props}
      />
    );
  },
);

InputGroupTextarea.displayName = 'InputGroupTextarea';

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea };
