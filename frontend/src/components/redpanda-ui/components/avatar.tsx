import { Avatar as AvatarPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

function Avatar({
  className,
  testId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & { testId?: string }) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-testid={testId}
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  testId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image> & { testId?: string }) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      data-testid={testId}
      className={cn('aspect-square size-full', className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  testId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & { testId?: string }) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      data-testid={testId}
      className={cn('bg-muted flex size-full items-center justify-center rounded-full', className)}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
