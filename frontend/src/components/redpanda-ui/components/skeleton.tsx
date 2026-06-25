import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const skeletonVariants = cva('animate-pulse bg-accent', {
  variants: {
    variant: {
      rounded: 'rounded-md',
      circle: 'rounded-full',
      text: 'h-4 rounded-md',
      heading: 'h-6 rounded-md',
      avatar: 'aspect-square rounded-full',
      button: 'h-9 rounded-md',
      card: 'rounded-lg',
    },
    size: {
      xs: 'h-2',
      sm: 'h-4',
      md: 'h-6',
      lg: 'h-8',
      xl: 'h-12',
    },
    width: {
      xs: 'w-16',
      sm: 'w-24',
      md: 'w-48',
      lg: 'w-64',
      xl: 'w-80',
      full: 'w-full',
      fit: 'w-fit',
    },
  },
  defaultVariants: {
    variant: 'rounded',
    size: 'md',
    width: 'md',
  },
});

interface SkeletonProps extends React.ComponentProps<'div'>, VariantProps<typeof skeletonVariants>, SharedProps {}

function Skeleton({ className, variant, size, width, testId, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(skeletonVariants({ variant, size, width }), className)}
      data-slot="skeleton"
      data-testid={testId}
      {...props}
    />
  );
}

interface SkeletonGroupProps extends SharedProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  spacing?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

function SkeletonGroup({ children, direction = 'vertical', spacing = 'md', className, testId }: SkeletonGroupProps) {
  const spacingClasses = {
    none: '',
    sm: direction === 'horizontal' ? 'space-x-2' : 'space-y-1',
    md: direction === 'horizontal' ? 'space-x-4' : 'space-y-2',
    lg: direction === 'horizontal' ? 'space-x-6' : 'space-y-4',
  };

  return (
    <div
      className={cn(
        'flex',
        direction === 'horizontal' ? 'flex-row items-center' : 'flex-col',
        spacingClasses[spacing],
        className
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

interface SkeletonAvatarProps extends SharedProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const skeletonAvatarSizeMap: Record<
  NonNullable<SkeletonAvatarProps['size']>,
  { size: SkeletonProps['size']; width: SkeletonProps['width']; className?: string }
> = {
  sm: { size: 'sm', width: 'fit' },
  md: { size: 'xl', width: 'fit' },
  lg: { size: 'xl', width: 'fit', className: 'h-16' },
};

function SkeletonAvatar({ size = 'md', className, testId }: SkeletonAvatarProps) {
  const { className: sizeClassName, ...variantProps } = skeletonAvatarSizeMap[size];

  return <Skeleton className={cn(sizeClassName, className)} testId={testId} variant="avatar" {...variantProps} />;
}

interface SkeletonTextProps extends SharedProps {
  lines?: number;
  width?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

function SkeletonText({ lines = 1, width = 'md', className, testId }: SkeletonTextProps) {
  const skeletonLines = Array.from({ length: lines }, (_, i) => ({
    width: (i === lines - 1 && lines > 1 ? 'md' : width) as 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'fit',
    id: `skeleton-${lines}-${i === lines - 1 && lines > 1 ? 'md' : width}-line-${i}`,
  }));

  return (
    <SkeletonGroup className={className} direction="vertical" spacing="sm" testId={testId}>
      {skeletonLines.map((line) => (
        <Skeleton key={line.id} variant="text" width={line.width} />
      ))}
    </SkeletonGroup>
  );
}

export { Skeleton, SkeletonGroup, SkeletonAvatar, SkeletonText, skeletonVariants };
