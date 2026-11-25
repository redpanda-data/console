// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

// Base UI uses data-disabled for focusable disabled controls; keep :disabled for
// native elements styled directly with the exported buttonVariants helper.
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center',
    'whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] motion-reduce:transition-none',
    'cursor-pointer',
    'disabled:pointer-events-none disabled:cursor-not-allowed data-disabled:cursor-not-allowed data-disabled:not-data-focusable:pointer-events-none data-disabled:active:scale-100',
    'shrink-0 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    // `!` to outrank the outline variants' `!important` rest border.
    'outline-none focus-visible:!border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
    'aria-invalid:!border-destructive aria-invalid:ring-invalid',
    'selection:bg-selection selection:text-selection-foreground',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        // Named after its family like `outline`/`ghost`/`dashed`, not after the `--color-secondary`
        // it paints: an unstyled control should not have to name a tone.
        default: [
          'bg-secondary text-secondary-foreground shadow-xs',
          'hover:bg-secondary-hover',
          'active:bg-secondary-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled data-disabled:bg-surface-disabled data-disabled:text-disabled',
        ],
        primary: [
          'bg-primary text-primary-foreground shadow-xs',
          'hover:bg-primary-hover',
          'active:bg-primary-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled data-disabled:bg-surface-disabled data-disabled:text-disabled',
        ],
        brand: [
          'bg-brand text-brand-foreground shadow-xs',
          'hover:bg-brand-hover',
          'active:bg-brand-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled data-disabled:bg-surface-disabled data-disabled:text-disabled',
        ],
        warning: [
          'bg-surface-warning text-warning-foreground shadow-xs',
          'hover:bg-surface-warning-hover',
          'active:bg-surface-warning-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled data-disabled:bg-surface-disabled data-disabled:text-disabled',
        ],
        destructive: [
          'bg-surface-destructive text-destructive-foreground shadow-xs',
          'hover:bg-surface-destructive-hover',
          'active:bg-surface-destructive-pressed',
          'focus-visible:ring-destructive/50',
          'disabled:bg-surface-disabled disabled:text-disabled data-disabled:bg-surface-disabled data-disabled:text-disabled',
        ],
        // Both sides flip, so it stays light on a dark ground and dark on a light one.
        inverse: [
          'bg-inverse text-strong shadow-xs',
          'hover:bg-inverse-hover',
          'active:bg-inverse-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled data-disabled:bg-surface-disabled data-disabled:text-disabled',
        ],
        // Outline, ghost and dashed repeat the filled tones with a border, no border, and a dashed
        // one. Each state steps the ramp its own rest token sits on, so a line moves one rung rather
        // than jumping family.
        outline: [
          'border !border-secondary-line bg-transparent text-secondary shadow-xs',
          'hover:!border-secondary-line-hover hover:bg-secondary-wash',
          'active:!border-secondary-line-pressed active:bg-secondary-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'primary-outline': [
          'border !border-primary-line bg-transparent text-primary shadow-xs',
          'hover:!border-primary-line-hover hover:bg-primary-wash',
          'active:!border-primary-line-pressed active:bg-primary-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'brand-outline': [
          'border !border-brand-line bg-transparent text-brand shadow-xs',
          'hover:!border-brand-line-hover hover:bg-brand-wash',
          'active:!border-brand-line-pressed active:bg-brand-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'warning-outline': [
          'border !border-warning-line bg-transparent text-warning shadow-xs',
          'hover:!border-warning-line-hover hover:bg-warning-wash',
          'active:!border-warning-line-pressed active:bg-warning-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'destructive-outline': [
          'border !border-destructive-line bg-transparent text-destructive shadow-xs',
          'hover:!border-destructive-line-hover hover:bg-destructive-wash',
          'active:!border-destructive-line-pressed active:bg-destructive-wash-pressed',
          'focus-visible:ring-destructive/50',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        // Takes the ground's own ink, for a fill this variant cannot know. Alpha, not a `-subtle`
        // token, so the wash steps off that inherited ink.
        'current-outline': [
          'border !border-current bg-transparent text-current shadow-xs',
          'hover:bg-current/15',
          'active:bg-current/25',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        ghost: [
          'bg-transparent text-secondary',
          'hover:bg-secondary-wash',
          'active:bg-secondary-wash-pressed',
          'not-disabled:not-data-disabled:aria-pressed:bg-secondary-wash-pressed not-disabled:not-data-disabled:data-[popup-open]:bg-secondary-wash',
          'disabled:text-disabled data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'primary-ghost': [
          'bg-transparent text-primary',
          'hover:bg-primary-wash',
          'active:bg-primary-wash-pressed',
          'not-disabled:not-data-disabled:aria-pressed:bg-primary-wash-pressed not-disabled:not-data-disabled:data-[popup-open]:bg-primary-wash',
          'disabled:text-disabled data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'brand-ghost': [
          'bg-transparent text-brand',
          'hover:bg-brand-wash',
          'active:bg-brand-wash-pressed',
          'not-disabled:not-data-disabled:aria-pressed:bg-brand-wash-pressed not-disabled:not-data-disabled:data-[popup-open]:bg-brand-wash',
          'disabled:text-disabled data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'warning-ghost': [
          'bg-transparent text-warning',
          'hover:bg-warning-wash',
          'active:bg-warning-wash-pressed',
          'not-disabled:not-data-disabled:aria-pressed:bg-warning-wash-pressed not-disabled:not-data-disabled:data-[popup-open]:bg-warning-wash',
          'disabled:text-disabled data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'destructive-ghost': [
          'bg-transparent text-destructive',
          'hover:bg-destructive-wash',
          'active:bg-destructive-wash-pressed',
          'not-disabled:not-data-disabled:aria-pressed:bg-destructive-wash-pressed not-disabled:not-data-disabled:data-[popup-open]:bg-destructive-wash',
          'focus-visible:ring-destructive/50',
          'disabled:text-disabled data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'current-ghost': [
          'bg-transparent text-current',
          'hover:bg-current/15',
          'active:bg-current/25',
          'not-disabled:not-data-disabled:aria-pressed:bg-current/25 not-disabled:not-data-disabled:data-[popup-open]:bg-current/15',
          'disabled:text-disabled data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        // Unshadowed, unlike `outline`: a placeholder should not sit proud of its ground.
        dashed: [
          'border border-dashed !border-secondary-line bg-transparent text-secondary',
          'hover:!border-secondary-line-hover hover:bg-secondary-wash',
          'active:!border-secondary-line-pressed active:bg-secondary-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'primary-dashed': [
          'border border-dashed !border-primary-line bg-transparent text-primary',
          'hover:!border-primary-line-hover hover:bg-primary-wash',
          'active:!border-primary-line-pressed active:bg-primary-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'brand-dashed': [
          'border border-dashed !border-brand-line bg-transparent text-brand',
          'hover:!border-brand-line-hover hover:bg-brand-wash',
          'active:!border-brand-line-pressed active:bg-brand-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'warning-dashed': [
          'border border-dashed !border-warning-line bg-transparent text-warning',
          'hover:!border-warning-line-hover hover:bg-warning-wash',
          'active:!border-warning-line-pressed active:bg-warning-wash-pressed',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'destructive-dashed': [
          'border border-dashed !border-destructive-line bg-transparent text-destructive',
          'hover:!border-destructive-line-hover hover:bg-destructive-wash',
          'active:!border-destructive-line-pressed active:bg-destructive-wash-pressed',
          'focus-visible:ring-destructive/50',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        'current-dashed': [
          'border border-dashed !border-current bg-transparent text-current',
          'hover:bg-current/15',
          'active:bg-current/25',
          'disabled:!border-border disabled:text-disabled data-disabled:!border-border data-disabled:bg-transparent data-disabled:text-disabled',
        ],
        link: [
          'text-action-primary link-standalone',
          'hover:text-action-primary-hover',
          'active:text-action-primary-pressed',
          'disabled:text-disabled disabled:no-underline data-disabled:text-disabled data-disabled:no-underline',
        ],
        // Code-like values that open a disclosure; the primitive owns truncation and typography.
        value:
          'block truncate font-mono text-body text-subtle hover:text-foreground disabled:text-disabled data-disabled:text-disabled',
        unstyled: '',
      },
      size: {
        content: 'h-auto gap-0 p-0 text-body',
        xs: 'h-6 gap-1 px-2 py-0 text-body-sm has-[>svg]:px-1.5 [&_svg]:size-3',
        sm: 'h-8 gap-2 px-3 py-0 text-body-sm has-[>kbd:last-child]:pr-2 has-[>svg]:px-2.5 [&_svg]:size-3.5',
        md: 'h-9 gap-2 px-4 py-0 text-body has-[>kbd:last-child]:pr-2 has-[>svg]:px-3 [&_svg]:size-4',
        lg: 'h-10 gap-2 px-6 py-0 text-body-lg has-[>svg]:px-4 [&_svg]:size-5',
        icon: 'size-9 [&_svg]:size-5',
        'icon-xs': 'size-6 [&_svg]:size-3.5',
        'icon-sm': 'size-8 [&_svg]:size-4',
        'icon-lg': 'size-10 [&_svg]:size-6',
      },
      weight: {
        normal: 'font-normal',
        medium: 'font-medium',
        semibold: 'font-semibold',
      },
      shape: {
        default: '',
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      // Neutral, not the action colour: an unstyled <Button> should not claim the page's one loud
      // slot. `primary` is opt-in. This is also why the swap left plain <Button> looking unchanged.
      variant: 'default',
      size: 'md',
      weight: 'semibold',
      shape: 'default',
    },
  }
);
