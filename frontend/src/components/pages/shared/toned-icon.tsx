import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { ComponentType, SVGProps } from 'react';

// Icons inherit `currentColor`; a tone picks a design token instead of a free-form colour class.
const tonedIconVariants = cva('', {
  variants: {
    tone: {
      default: '',
      destructive: 'text-destructive',
      success: 'text-success',
      warning: 'text-warning',
      informative: 'text-informative',
      muted: 'text-muted-foreground',
      disabled: 'text-disabled',
      primary: 'text-primary',
      action: 'text-action-primary',
      live: 'text-success',
    },
    spin: {
      true: 'animate-spin',
      false: '',
    },
  },
  defaultVariants: {
    tone: 'default',
    spin: false,
  },
});

type IconComponentProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string };

export type IconTone = NonNullable<VariantProps<typeof tonedIconVariants>['tone']>;

export type TonedIconProps = IconComponentProps &
  VariantProps<typeof tonedIconVariants> & {
    icon: ComponentType<IconComponentProps>;
  };

/** Renders `icon` in a design-token tone; `className` stays for layout (size, margin, shrink). */
export function TonedIcon({ icon: Icon, tone, spin, className, ...props }: TonedIconProps) {
  return <Icon {...props} className={cn(tonedIconVariants({ tone, spin }), className)} />;
}
