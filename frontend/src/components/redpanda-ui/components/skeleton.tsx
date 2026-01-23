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

// Compound skeleton components for common patterns
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

// Pre-built skeleton patterns
function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = {
    sm: { size: 'sm' as const, width: 'fit' as const },
    md: { size: 'xl' as const, width: 'fit' as const },
    lg: { size: 'xl' as const, width: 'fit' as const },
  };

  return <Skeleton variant="avatar" {...sizeMap[size]} />;
}

function SkeletonText({ lines = 1, width = 'md' }: { lines?: number; width?: 'sm' | 'md' | 'lg' | 'full' }) {
  const skeletonLines = Array.from({ length: lines }, (_, i) => ({
    width: (i === lines - 1 && lines > 1 ? 'md' : width) as 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'fit',
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
    <div className="rounded-lg border bg-card p-4">
      <SkeletonGroup direction="horizontal">
        <SkeletonAvatar />
        <SkeletonGroup className="flex-1" direction="vertical" spacing="sm">
          <Skeleton variant="heading" width="md" />
          <SkeletonText lines={2} width="lg" />
        </SkeletonGroup>
      </SkeletonGroup>
    </div>
  );
}

export { Skeleton, SkeletonGroup, SkeletonAvatar, SkeletonText, SkeletonCard, skeletonVariants };
