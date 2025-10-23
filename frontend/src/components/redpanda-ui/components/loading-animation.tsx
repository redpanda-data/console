'use client';

import { type LottieOptions, useLottie } from 'lottie-react';
import React from 'react';

import { cn } from '../lib/utils';

export interface LoadingAnimationProps {
  type: 'lottie' | 'svg';
  // biome-ignore lint/suspicious/noExplicitAny: part of the lottie-react library
  data?: any;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  lottieOptions?: Partial<LottieOptions>;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
  scale?: number;
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  aspectRatio?: string;
  responsive?: boolean;
  centered?: boolean;
  progress?: number;
}

export const LoadingAnimation = React.forwardRef<HTMLDivElement, LoadingAnimationProps>(
  (
    {
      type,
      data,
      children,
      className,
      style,
      lottieOptions = {},
      containerProps,
      scale,
      width,
      height,
      minHeight,
      aspectRatio,
      responsive = true,
      centered = true,
      progress,
      ...props
    },
    ref,
  ) => {
    const lottieView = useLottie(
      type === 'lottie' && data
        ? {
            animationData: data,
            loop: progress === undefined,
            autoplay: progress === undefined,
            ...lottieOptions,
          }
        : { animationData: null },
    );

    const containerStyle: React.CSSProperties = {
      ...style,
      ...(width && { width }),
      ...(height && { height }),
      ...(minHeight && { minHeight }),
      ...(aspectRatio && { aspectRatio }),
      ...(scale && { transform: `scale(${scale})` }),
    };

    const containerClasses = cn(
      responsive && 'w-full h-full',
      centered && 'flex items-center justify-center',
      className,
    );

    // Clone children and pass progress prop to them if it's an SVG animation
    const childrenWithProgress = React.Children.map(children, (child) => {
      if (React.isValidElement(child) && progress !== undefined) {
        // biome-ignore lint/suspicious/noExplicitAny: part of animation implementation
        return React.cloneElement(child, { progress } as any);
      }
      return child;
    });

    if (type === 'svg') {
      return (
        <div ref={ref} className={containerClasses} style={containerStyle} {...containerProps} {...props}>
          {childrenWithProgress}
        </div>
      );
    }

    if (type === 'lottie' && data) {
      return (
        <div ref={ref} className={containerClasses} style={containerStyle} {...containerProps} {...props}>
          {lottieView.View}
        </div>
      );
    }

    return (
      <div ref={ref} className={containerClasses} style={containerStyle} {...containerProps} {...props}>
        {childrenWithProgress}
      </div>
    );
  },
);

LoadingAnimation.displayName = 'LoadingAnimation';
