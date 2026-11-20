import type { AnimationConfigWithData, AnimationItem } from 'lottie-web/build/player/lottie_light';

/** The capabilities LoadingAnimation actually consumes from a browser player. */
export type LottieAnimation = Pick<AnimationItem, 'addEventListener' | 'destroy' | 'goToAndStop' | 'totalFrames'>;

interface LottiePlayer {
  loadAnimation: (options: AnimationConfigWithData) => LottieAnimation;
}

/** Load the browser-only backend without importing its canvas initialization during SSR. */
export async function loadLottiePlayer(): Promise<LottiePlayer> {
  const module = await import('lottie-web/build/player/lottie_light');
  return module.default;
}
