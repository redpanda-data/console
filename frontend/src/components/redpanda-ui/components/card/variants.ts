import { cva } from 'class-variance-authority';

// Each variant changes a different channel: `default` an edge and a lift, `muted` the fill, `ghost`
// nothing. Each owns its border colour and fill, so none of them fights a base class when
// `cardVariants()` is used without `cn`, and every one keeps the 1px border, so swapping variants
// never moves the content.
export const cardVariants = cva('flex min-w-0 flex-col rounded-lg border border-solid text-card-foreground', {
  variants: {
    // `w-full` alongside each cap, so a size means "fill up to this width" — without it a
    // card in a centring or shrink-to-fit parent takes its *content* width instead.
    size: {
      sm: 'w-full max-w-sm gap-2 px-6 py-4',
      md: 'w-full max-w-md gap-4 px-8 py-6',
      lg: 'w-full max-w-lg gap-4 px-10 py-8',
      xl: 'w-full max-w-xl gap-6 px-12 py-10',
      full: 'w-full gap-4 px-8 py-6',
    },
    variant: {
      default: 'border-border bg-card shadow-elevated',
      // `surface-muted` is the tint that reads on the page and inside a panel in both themes.
      muted: 'border-transparent bg-surface-muted',
      ghost: 'border-transparent bg-transparent text-inherit',
    },
    padding: {
      none: 'p-0',
    },
  },
  defaultVariants: {
    size: 'full',
    variant: 'default',
  },
});
