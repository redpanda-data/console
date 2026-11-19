// Copyright 2026 Redpanda Data, Inc.

'use client';

import type {
  AnimationConfigWithData,
  AnimationEventCallback,
  AnimationEventName,
  AnimationEvents,
} from 'lottie-web/build/player/lottie_light';
import React from 'react';
import { cn, type SharedProps } from '../lib/utils';
import { type LottieAnimation, loadLottiePlayer } from './loading-animation/lottie-player';

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
  aspectRatio?: string | undefined;
  centered?: boolean | undefined;
  children?: React.ReactNode | undefined;
  className?: string | undefined;
  containerProps?: React.HTMLAttributes<HTMLDivElement> | undefined;
  data?: unknown;
  height?: string | number | undefined;
  lottieOptions?: LoadingAnimationLottieOptions | undefined;
  minHeight?: string | number | undefined;
  progress?: number | undefined;
  responsive?: boolean | undefined;
  scale?: number | undefined;
  style?: React.CSSProperties | undefined;
  type: 'lottie' | 'svg';
  width?: string | number | undefined;
}

interface LottieViewProps {
  data: unknown;
  options: LoadingAnimationLottieOptions;
  progress?: number | undefined;
}

const defaultLottieOptions: LoadingAnimationLottieOptions = {};

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

// The unsubscribe callback `addEventListener` returns is deliberately dropped:
// `destroy()` clears lottie's listener map wholesale, and calling one afterwards
// reads off that nulled map and throws.
function subscribeToLottieEvent<Name extends AnimationEventName>(
  animation: LottieAnimation,
  optionsRef: React.RefObject<LoadingAnimationLottieOptions>,
  name: Name,
  selectHandler: (
    options: LoadingAnimationLottieOptions
  ) => AnimationEventCallback<AnimationEvents[Name]> | null | undefined
) {
  animation.addEventListener(name, (event) => {
    selectHandler(optionsRef.current)?.(event);
  });
}

function subscribeToLottieEvents(
  animation: LottieAnimation,
  optionsRef: React.RefObject<LoadingAnimationLottieOptions>
) {
  subscribeToLottieEvent(animation, optionsRef, 'complete', (options) => options.onComplete);
  subscribeToLottieEvent(animation, optionsRef, 'loopComplete', (options) => options.onLoopComplete);
  subscribeToLottieEvent(animation, optionsRef, 'enterFrame', (options) => options.onEnterFrame);
  subscribeToLottieEvent(animation, optionsRef, 'segmentStart', (options) => options.onSegmentStart);
  subscribeToLottieEvent(animation, optionsRef, 'config_ready', (options) => options.onConfigReady);
  subscribeToLottieEvent(animation, optionsRef, 'data_ready', (options) => options.onDataReady);
  subscribeToLottieEvent(animation, optionsRef, 'data_failed', (options) => options.onDataFailed);
  subscribeToLottieEvent(animation, optionsRef, 'loaded_images', (options) => options.onLoadedImages);
  subscribeToLottieEvent(animation, optionsRef, 'DOMLoaded', (options) => options.onDOMLoaded);
  subscribeToLottieEvent(animation, optionsRef, 'destroy', (options) => options.onDestroy);
}

function seekToProgress(animation: LottieAnimation, progress: number) {
  const boundedProgress = Math.min(100, Math.max(0, progress));
  animation.goToAndStop((boundedProgress / 100) * animation.totalFrames, true);
}

function LottieView({ data, options, progress }: LottieViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const animationRef = React.useRef<LottieAnimation>(undefined);
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
      if (container === null) {
        return;
      }

      let disposed = false;
      let loadedAnimation: LottieAnimation | undefined;
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
          subscribeToLottieEvents(animation, optionsRef);
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
        // `destroy()` emits the `destroy` event and then nulls lottie's internal
        // listener map, which is what drops every subscription.
        loadedAnimation?.destroy();
        if (animationRef.current === loadedAnimation) {
          animationRef.current = undefined;
        }
      };
    },
    [assetsPath, autoplay, data, loop, name, renderer]
  );

  React.useEffect(
    function synchronizeLottieProgress() {
      if (progress === undefined || animationRef.current === undefined) {
        return;
      }
      seekToProgress(animationRef.current, progress);
    },
    [progress]
  );

  return (
    <>
      <div aria-hidden="true" className="size-full" ref={containerRef} />
      {loadError !== null && loadError !== '' ? (
        <div className="text-body-sm text-destructive" role="alert">
          {loadError}
        </div>
      ) : (
        loadError
      )}
    </>
  );
}

interface ContainerSizing {
  '--loading-aspect-ratio': React.CSSProperties['aspectRatio'];
  '--loading-height': string | undefined;
  '--loading-min-height': string | undefined;
  '--loading-transform': string | undefined;
  '--loading-width': string | undefined;
}

function resolveLength(value: string | number | undefined, fallback: React.CSSProperties['width']) {
  const resolved = value === undefined || value === 0 || value === '' ? fallback : value;
  return typeof resolved === 'number' ? `${resolved}px` : resolved;
}

function resolveTransform(scale: number | undefined, fallback: React.CSSProperties['transform']) {
  return scale === undefined || scale === 0 ? fallback : `scale(${scale})`;
}

function loadingContainerClasses(
  sizing: Readonly<{
    width: string | undefined;
    height: string | undefined;
    minHeight: string | undefined;
    aspectRatio: React.CSSProperties['aspectRatio'];
    transform: string | undefined;
  }>,
  {
    centered,
    className,
    containerProps,
    responsive,
  }: Pick<LoadingAnimationProps, 'centered' | 'className' | 'containerProps' | 'responsive'>
) {
  const base =
    containerProps !== undefined && Object.hasOwn(containerProps, 'className')
      ? containerProps.className
      : cn(responsive === true && 'size-full', centered === true && 'flex items-center justify-center', className);
  if (containerProps !== undefined && Object.hasOwn(containerProps, 'style')) {
    return base;
  }
  return cn(
    base,
    sizing.width !== undefined && 'w-(--loading-width)',
    sizing.height !== undefined && 'h-(--loading-height)',
    sizing.minHeight !== undefined && 'min-h-(--loading-min-height)',
    sizing.aspectRatio !== undefined && 'aspect-(--loading-aspect-ratio)',
    sizing.transform !== undefined && 'transform-(--loading-transform)'
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
}: LoadingAnimationProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => {
  const {
    width: styleWidth,
    height: styleHeight,
    minHeight: styleMinHeight,
    aspectRatio: styleAspectRatio,
    transform: styleTransform,
    ...forwardedStyle
  } = style ?? {};
  const containerStyle: React.CSSProperties & ContainerSizing = {
    ...forwardedStyle,
    '--loading-width': resolveLength(width, styleWidth),
    '--loading-height': resolveLength(height, styleHeight),
    '--loading-min-height': resolveLength(minHeight, styleMinHeight),
    '--loading-aspect-ratio': aspectRatio === undefined || aspectRatio === '' ? styleAspectRatio : aspectRatio,
    '--loading-transform': resolveTransform(scale, styleTransform),
  };
  const containerClasses = loadingContainerClasses(
    {
      width: containerStyle['--loading-width'],
      height: containerStyle['--loading-height'],
      minHeight: containerStyle['--loading-min-height'],
      aspectRatio: containerStyle['--loading-aspect-ratio'],
      transform: containerStyle['--loading-transform'],
    },
    { centered, className, containerProps, responsive }
  );

  return (
    <div
      ref={ref}
      style={containerStyle}
      {...containerProps}
      {...props}
      className={containerClasses}
      data-testid={testId}
    >
      {type === 'lottie' && data !== undefined && data !== null ? (
        <LottieView data={data} options={lottieOptions} progress={progress} />
      ) : (
        children
      )}
    </div>
  );
};
