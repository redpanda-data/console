// Copyright 2026 Redpanda Data, Inc.

'use client';

import type {
  AnimationConfigWithData,
  AnimationEventCallback,
  AnimationEventName,
  AnimationEvents,
  AnimationItem,
} from 'lottie-web/build/player/lottie_light';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

export interface LoadingAnimationLottieOptions extends Omit<AnimationConfigWithData, 'animationData' | 'container'> {
  onComplete?: AnimationEventCallback<AnimationEvents['complete']> | null;
  onConfigReady?: AnimationEventCallback<AnimationEvents['config_ready']> | null;
  onDataFailed?: AnimationEventCallback<AnimationEvents['data_failed']> | null;
  onDataReady?: AnimationEventCallback<AnimationEvents['data_ready']> | null;
  onDestroy?: AnimationEventCallback<AnimationEvents['destroy']> | null;
  onDOMLoaded?: AnimationEventCallback<AnimationEvents['DOMLoaded']> | null;
  onEnterFrame?: AnimationEventCallback<AnimationEvents['enterFrame']> | null;
  onLoadedImages?: AnimationEventCallback<AnimationEvents['loaded_images']> | null;
  onLoopComplete?: AnimationEventCallback<AnimationEvents['loopComplete']> | null;
  onSegmentStart?: AnimationEventCallback<AnimationEvents['segmentStart']> | null;
}

export interface LoadingAnimationProps extends SharedProps {
  aspectRatio?: string;
  centered?: boolean;
  children?: React.ReactNode;
  className?: string;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
  data?: unknown;
  height?: string | number;
  lottieOptions?: LoadingAnimationLottieOptions;
  minHeight?: string | number;
  progress?: number;
  responsive?: boolean;
  scale?: number;
  style?: React.CSSProperties;
  type: 'lottie' | 'svg';
  width?: string | number;
}

interface LottieViewProps {
  data: unknown;
  options: LoadingAnimationLottieOptions;
  progress?: number;
}

const defaultLottieOptions: LoadingAnimationLottieOptions = {};

function loadLottiePlayer() {
  return import('lottie-web/build/player/lottie_light').then((module) => module.default);
}

function getOptionalLottieConfig(
  assetsPath: LoadingAnimationLottieOptions['assetsPath'],
  audioFactory: LoadingAnimationLottieOptions['audioFactory'],
  initialSegment: LoadingAnimationLottieOptions['initialSegment'],
  name: LoadingAnimationLottieOptions['name'],
  rendererSettings: LoadingAnimationLottieOptions['rendererSettings']
) {
  return {
    ...(assetsPath === undefined ? {} : { assetsPath }),
    ...(audioFactory === undefined ? {} : { audioFactory }),
    ...(initialSegment === undefined ? {} : { initialSegment }),
    ...(name === undefined ? {} : { name }),
    ...(rendererSettings === undefined ? {} : { rendererSettings }),
  };
}

function subscribeToLottieEvent<Name extends AnimationEventName>(
  animation: AnimationItem,
  optionsRef: React.RefObject<LoadingAnimationLottieOptions>,
  name: Name,
  selectHandler: (
    options: LoadingAnimationLottieOptions
  ) => AnimationEventCallback<AnimationEvents[Name]> | null | undefined
) {
  return animation.addEventListener(name, (event) => {
    selectHandler(optionsRef.current)?.(event);
  });
}

function subscribeToLottieEvents(animation: AnimationItem, optionsRef: React.RefObject<LoadingAnimationLottieOptions>) {
  return [
    subscribeToLottieEvent(animation, optionsRef, 'complete', (options) => options.onComplete),
    subscribeToLottieEvent(animation, optionsRef, 'loopComplete', (options) => options.onLoopComplete),
    subscribeToLottieEvent(animation, optionsRef, 'enterFrame', (options) => options.onEnterFrame),
    subscribeToLottieEvent(animation, optionsRef, 'segmentStart', (options) => options.onSegmentStart),
    subscribeToLottieEvent(animation, optionsRef, 'config_ready', (options) => options.onConfigReady),
    subscribeToLottieEvent(animation, optionsRef, 'data_ready', (options) => options.onDataReady),
    subscribeToLottieEvent(animation, optionsRef, 'data_failed', (options) => options.onDataFailed),
    subscribeToLottieEvent(animation, optionsRef, 'loaded_images', (options) => options.onLoadedImages),
    subscribeToLottieEvent(animation, optionsRef, 'DOMLoaded', (options) => options.onDOMLoaded),
    subscribeToLottieEvent(animation, optionsRef, 'destroy', (options) => options.onDestroy),
  ];
}

function seekToProgress(animation: AnimationItem, progress: number) {
  const boundedProgress = Math.min(100, Math.max(0, progress));
  animation.goToAndStop((boundedProgress / 100) * animation.totalFrames, true);
}

function LottieView({ data, options, progress }: LottieViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const animationRef = React.useRef<AnimationItem>(undefined);
  const optionsRef = React.useRef(options);
  const progressRef = React.useRef(progress);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const { assetsPath, autoplay: configuredAutoplay, loop: configuredLoop, name, renderer = 'svg' } = options;
  const autoplay = configuredAutoplay ?? progress === undefined;
  const loop = configuredLoop ?? progress === undefined;

  React.useEffect(
    function updateLottieOptions() {
      optionsRef.current = options;
    },
    [options]
  );

  React.useEffect(
    function updateLottieProgress() {
      progressRef.current = progress;
    },
    [progress]
  );

  React.useEffect(
    function loadLottieAnimation() {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      let disposed = false;
      let loadedAnimation: AnimationItem | undefined;
      let unsubscribe: Array<() => void> = [];
      loadLottiePlayer()
        .then((player) => {
          if (disposed) {
            return;
          }
          const { audioFactory, initialSegment, rendererSettings } = optionsRef.current;
          const animation = player.loadAnimation({
            ...getOptionalLottieConfig(assetsPath, audioFactory, initialSegment, name, rendererSettings),
            animationData: data,
            autoplay,
            container,
            loop,
            renderer,
          });
          loadedAnimation = animation;
          animationRef.current = animation;
          unsubscribe = subscribeToLottieEvents(animation, optionsRef);
          if (progressRef.current !== undefined) {
            seekToProgress(animation, progressRef.current);
          }
          setLoadError(null);
        })
        .catch(() => {
          if (!disposed) {
            setLoadError('Animation could not load.');
          }
        });

      return function destroyLottieAnimation() {
        disposed = true;
        loadedAnimation?.destroy();
        for (const removeListener of unsubscribe) {
          removeListener();
        }
        if (animationRef.current === loadedAnimation) {
          animationRef.current = undefined;
        }
      };
    },
    [assetsPath, autoplay, data, loop, name, renderer]
  );

  React.useEffect(
    function synchronizeLottieProgress() {
      if (progress === undefined || !animationRef.current) {
        return;
      }
      seekToProgress(animationRef.current, progress);
    },
    [progress]
  );

  return (
    <>
      <div aria-hidden="true" className="h-full w-full" ref={containerRef} />
      {loadError && (
        <div className="text-body-sm text-destructive" role="alert">
          {loadError}
        </div>
      )}
    </>
  );
}

export const LoadingAnimation = ({
  type,
  data,
  children,
  className,
  style,
  lottieOptions = defaultLottieOptions,
  containerProps,
  scale,
  width,
  height,
  minHeight,
  aspectRatio,
  responsive = true,
  centered = true,
  progress,
  testId,
  ref,
  ...props
}: LoadingAnimationProps & { ref?: React.Ref<HTMLDivElement> }) => {
  const containerStyle: React.CSSProperties = {
    ...style,
    ...(width && { width }),
    ...(height && { height }),
    ...(minHeight && { minHeight }),
    ...(aspectRatio && { aspectRatio }),
    ...(scale && { transform: `scale(${scale})` }),
  };

  const containerClasses = cn(responsive && 'h-full w-full', centered && 'flex items-center justify-center', className);

  const childrenWithProgress = React.Children.map(children, (child) => {
    if (React.isValidElement<{ progress?: number }>(child) && progress !== undefined) {
      return React.cloneElement(child, { progress });
    }
    return child;
  });

  if (type === 'svg') {
    return (
      <div
        className={containerClasses}
        ref={ref}
        style={containerStyle}
        {...containerProps}
        {...props}
        data-testid={testId}
      >
        {childrenWithProgress}
      </div>
    );
  }

  if (type === 'lottie' && data) {
    return (
      <div
        className={containerClasses}
        ref={ref}
        style={containerStyle}
        {...containerProps}
        {...props}
        data-testid={testId}
      >
        <LottieView data={data} options={lottieOptions} progress={progress} />
      </div>
    );
  }

  return (
    <div
      className={containerClasses}
      ref={ref}
      style={containerStyle}
      {...containerProps}
      {...props}
      data-testid={testId}
    >
      {childrenWithProgress}
    </div>
  );
};

LoadingAnimation.displayName = 'LoadingAnimation';
