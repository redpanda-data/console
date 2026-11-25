import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import type React from 'react';
import { cn, type DataAttributes, type SharedProps } from '../lib/utils';
import { type BadgeAppearance, badgeStyleVariants, resolveBadgeVariant } from './badge/variants';

export type BadgeProps = useRender.ComponentProps<'span'> &
  SharedProps &
  BadgeAppearance & {
    icon?: React.ReactNode | undefined;
  };

function Badge({
  className,
  tone = 'default',
  variant = 'solid',
  size,
  testId,
  icon,
  children,
  render,
  disabled = false,
  ...props
}: BadgeProps) {
  const resolvedVariant = resolveBadgeVariant(tone, variant, disabled);
  // A custom `render` element owns its children (no `icon` composition); the default span composes
  // `icon` + children, wrapping only string children — others need the badge's own inline-flex layout.
  let content: React.ReactNode = children;
  if (render === undefined) {
    const label = typeof children === 'string' ? <span className="truncate">{children}</span> : children;
    content = (
      <>
        {icon}
        {label}
      </>
    );
  }

  const elementProps = {
    className: cn(badgeStyleVariants({ variant: resolvedVariant, size }), className),
    'data-testid': testId,
    'aria-disabled': disabled || undefined,
    children: content,
  } satisfies React.ComponentPropsWithRef<'span'> & DataAttributes;

  return useRender({
    defaultTagName: 'span',
    render,
    state: {
      slot: 'badge',
      variant: resolvedVariant,
    },
    props: mergeProps<'span'>(elementProps, props),
  });
}

export type { BadgeAppearance, BadgeEmphasis, BadgeSize, BadgeTone } from './badge/variants';
export { Badge };
