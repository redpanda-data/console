import { cva } from 'class-variance-authority';

export const emptyVariants = cva(
  'flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12',
  {
    variants: {
      variant: {
        default: '',
        outline: 'border',
        muted: 'bg-linear-to-b from-surface-recess from-30% to-background',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export const emptyMediaVariants = cva(
  'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-foreground [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);
