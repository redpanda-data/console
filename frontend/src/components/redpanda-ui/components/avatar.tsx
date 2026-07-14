'use client';

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const avatarVariants = cva('group/avatar relative flex shrink-0 select-none rounded-full', {
  variants: {
    size: {
      default: 'size-8',
      sm: 'size-6',
      lg: 'size-10',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

function Avatar({
  className,
  size = 'default',
  testId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & SharedProps & VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root
      className={cn(avatarVariants({ size }), className)}
      data-size={size ?? 'default'}
      data-slot="avatar"
      data-testid={testId}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  testId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image> & SharedProps) {
  return (
    <AvatarPrimitive.Image
      className={cn('aspect-square size-full rounded-full object-cover', className)}
      data-slot="avatar-image"
      data-testid={testId}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  testId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & SharedProps) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-muted text-sm group-data-[size=sm]/avatar:text-xs',
        className
      )}
      data-slot="avatar-fallback"
      data-testid={testId}
      {...props}
    />
  );
}

function AvatarBadge({ className, testId, ...props }: React.ComponentProps<'span'> & SharedProps) {
  return (
    <span
      className={cn(
        'absolute right-0 bottom-0 z-10 inline-flex select-none items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background',
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

function AvatarGroup({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        className
      )}
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
        'relative flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-muted text-sm ring-2 ring-background',
        className
      )}
      data-slot="avatar-group-count"
      data-testid={testId}
      {...props}
    />
  );
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage, avatarVariants };
