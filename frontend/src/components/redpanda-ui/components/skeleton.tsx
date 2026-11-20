import type { VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn, type SharedProps } from '../lib/utils';
import { skeletonVariants } from './skeleton/variants';

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
  className?: string | undefined;
  direction?: 'horizontal' | 'vertical' | undefined;
  spacing?: 'none' | 'sm' | 'md' | 'lg' | undefined;
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
  className?: string | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined;
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
  className?: string | undefined;
  lines?: number | undefined;
  width?: 'sm' | 'md' | 'lg' | 'full' | undefined;
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

export { Skeleton, SkeletonAvatar, SkeletonGroup, SkeletonText };
