'use client';

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import type { VariantProps } from 'class-variance-authority';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';
import { avatarFallbackVariants, avatarVariants } from './avatar/variants';

type AvatarProps = React.ComponentProps<typeof AvatarPrimitive.Root> &
  SharedProps &
  Omit<VariantProps<typeof avatarVariants>, 'frame'> & {
    frame?: NonNullable<VariantProps<typeof avatarVariants>['frame']> | undefined;
  };

function Avatar({ className, frame = 'none', shape = 'round', size = 'md', testId, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(avatarVariants({ frame, shape, size }), className)}
      data-frame={frame}
      data-size={size ?? 'md'}
      data-slot="avatar"
      data-testid={testId}
      {...props}
    />
  );
}

type AvatarImageProps = React.ComponentProps<typeof AvatarPrimitive.Image> &
  SharedProps & { monochrome?: boolean | undefined };

function AvatarImage({ className, monochrome = false, testId, ...props }: AvatarImageProps) {
  return (
    <AvatarPrimitive.Image
      className={cn(
        'aspect-square size-full rounded-[inherit] object-cover',
        monochrome ? 'grayscale' : undefined,
        className
      )}
      data-monochrome={monochrome || undefined}
      data-slot="avatar-image"
      data-testid={testId}
      {...props}
    />
  );
}

type AvatarFallbackProps = React.ComponentProps<typeof AvatarPrimitive.Fallback> &
  SharedProps & { tone?: NonNullable<VariantProps<typeof avatarFallbackVariants>['tone']> | undefined };

function AvatarFallback({ className, testId, tone = 'default', ...props }: AvatarFallbackProps) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(avatarFallbackVariants({ tone }), className)}
      data-slot="avatar-fallback"
      data-testid={testId}
      data-tone={tone}
      {...props}
    />
  );
}

function AvatarBadge({ className, testId, ...props }: React.ComponentProps<'span'> & SharedProps) {
  return (
    <span
      className={cn(
        'absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className
      )}
      data-slot="avatar-badge"
      data-testid={testId}
      {...props}
    />
  );
}

type AvatarGroupProps = React.ComponentProps<'div'> & SharedProps & { monochrome?: boolean | undefined };

function AvatarGroup({ className, monochrome = false, testId, ...props }: AvatarGroupProps) {
  return (
    <div
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        monochrome ? '*:data-[slot=avatar]:grayscale' : undefined,
        className
      )}
      data-monochrome={monochrome || undefined}
      data-slot="avatar-group"
      data-testid={testId}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-body ring-2 ring-background select-none',
        className
      )}
      data-slot="avatar-group-count"
      data-testid={testId}
      {...props}
    />
  );
}

export type { AvatarFallbackProps, AvatarGroupProps, AvatarImageProps, AvatarProps };
export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };
