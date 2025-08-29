import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';

const skeletonVariants = cva('bg-accent animate-pulse', {
  variants: {
    variant: {
      default: 'rounded-md',
      circle: 'rounded-full',
      text: 'rounded-md h-4',
      heading: 'rounded-md h-6',
      avatar: 'rounded-full aspect-square',
      button: 'rounded-md h-9',
      card: 'rounded-lg',
    },
    size: {
      xs: 'h-2',
      sm: 'h-4',
      default: 'h-6',
      lg: 'h-8',
      xl: 'h-12',
    },
    width: {
      xs: 'w-16',
      sm: 'w-24',
      default: 'w-32',
      md: 'w-48',
      lg: 'w-64',
      xl: 'w-80',
      full: 'w-full',
      fit: 'w-fit',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
    width: 'default',
  },
});

interface SkeletonProps extends React.ComponentProps<'div'>, VariantProps<typeof skeletonVariants> {
  testId?: string;
}

function Skeleton({ className, variant, size, width, testId, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      data-testid={testId}
      className={cn(skeletonVariants({ variant, size, width }), className)}
      {...props}
    />
  );
}

// Compound skeleton components for common patterns
interface SkeletonGroupProps {
  children: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  spacing?: 'none' | 'sm' | 'default' | 'lg';
  className?: string;
  testId?: string;
}

function SkeletonGroup({
  children,
  direction = 'vertical',
  spacing = 'default',
  className,
  testId,
}: SkeletonGroupProps) {
  const spacingClasses = {
    none: '',
    sm: direction === 'horizontal' ? 'space-x-2' : 'space-y-1',
    default: direction === 'horizontal' ? 'space-x-4' : 'space-y-2',
    lg: direction === 'horizontal' ? 'space-x-6' : 'space-y-4',
  };

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex',
        direction === 'horizontal' ? 'flex-row items-center' : 'flex-col',
        spacingClasses[spacing],
        className,
      )}
    >
      {children}
    </div>
  );
}

// Pre-built skeleton patterns
function SkeletonAvatar({ size = 'default' }: { size?: 'sm' | 'default' | 'lg' }) {
  const sizeMap = {
    sm: { size: 'sm' as const, width: 'fit' as const },
    default: { size: 'xl' as const, width: 'fit' as const },
    lg: { size: 'xl' as const, width: 'fit' as const },
  };

  return <Skeleton variant="avatar" {...sizeMap[size]} />;
}

function SkeletonText({ lines = 1, width = 'default' }: { lines?: number; width?: 'sm' | 'default' | 'lg' | 'full' }) {
  const skeletonLines = Array.from({ length: lines }, (_, i) => ({
    width: (i === lines - 1 && lines > 1 ? 'md' : width) as 'sm' | 'default' | 'lg' | 'md' | 'xl' | 'full' | 'fit',
    id: `skeleton-${lines}-${i === lines - 1 && lines > 1 ? 'md' : width}-line-${i}`,
  }));

  return (
    <SkeletonGroup direction="vertical" spacing="sm">
      {skeletonLines.map((line) => (
        <Skeleton key={line.id} variant="text" width={line.width} />
      ))}
    </SkeletonGroup>
  );
}

function SkeletonCard() {
  return (
    <div className="p-4 border rounded-lg bg-white dark:bg-gray-900">
      <SkeletonGroup direction="horizontal" spacing="default">
        <SkeletonAvatar />
        <SkeletonGroup direction="vertical" spacing="sm" className="flex-1">
          <Skeleton variant="heading" width="md" />
          <SkeletonText lines={2} width="lg" />
        </SkeletonGroup>
      </SkeletonGroup>
    </div>
  );
}

export { Skeleton, SkeletonGroup, SkeletonAvatar, SkeletonText, SkeletonCard, skeletonVariants };
