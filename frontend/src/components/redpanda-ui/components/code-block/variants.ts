// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const codeBlockVariants = cva(
  'group/code-block relative flex w-full min-w-0 flex-col overflow-hidden rounded-lg border text-body has-[>[data-slot=code-block-content]:focus-visible]:ring-3 has-[>[data-slot=code-block-content]:focus-visible]:ring-ring/50 data-[size=sm]:text-body-sm',
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

export const codeBlockLineVariants = cva(
  // `in-data-wrap:min-w-0`: a line is a grid item, which will not shrink below its content without it,
  // so a URL or long identifier would still overflow a wrapped block.
  "relative -mx-3 block min-h-lh px-3 group-data-[size=sm]/code-block:-mx-2.5 group-data-[size=sm]/code-block:px-2.5 before:min-w-6 before:text-end before:text-subtle after:absolute after:inset-s-1 after:top-0 after:text-subtle after:select-none in-data-numbered:col-span-2 in-data-numbered:grid in-data-numbered:grid-cols-subgrid in-data-numbered:gap-x-3 in-data-numbered:[counter-increment:line] in-data-numbered:before:content-[counter(line)] in-data-numbered:before:select-none in-data-wrap:min-w-0 in-data-numbered:supports-[content:counter(line)_/_'']:before:content-[counter(line)_/_'']",
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
