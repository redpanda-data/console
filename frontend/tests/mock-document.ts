Object.defineProperty(window.document, 'getAnimations', {
    writable: false,
    value: () => [],
  });
  
export {};
