// Mock for lottie-web to avoid canvas API issues in jsdom
export default {
  loadAnimation: () => ({
    destroy: () => {},
    play: () => {},
    stop: () => {},
    pause: () => {},
    setSpeed: () => {},
    goToAndStop: () => {},
    goToAndPlay: () => {},
    setDirection: () => {},
    playSegments: () => {},
    setSubframe: () => {},
    getDuration: () => 0,
  }),
};
