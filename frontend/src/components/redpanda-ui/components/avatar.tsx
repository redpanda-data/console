import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

function Avatar({ className, testId, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root> & SharedProps) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
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
      className={cn('aspect-square size-full', className)}
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
      className={cn('flex size-full items-center justify-center rounded-full bg-muted', className)}
      data-slot="avatar-fallback"
      data-testid={testId}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
