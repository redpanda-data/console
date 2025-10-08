declare module '*.module.scss';
declare module '*.module.sass';
declare module '*.module.less';
declare module '*.module.css';

declare module '*.svg';
declare module '*.png';
declare module '*.jpg';

// Heap Analytics types
declare global {
  type Window = {
    heap: {
      identify: (email: string) => void;
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
      addUserProperties: (properties: Record<string, unknown>) => void;
      addEventProperties: (properties: Record<string, unknown>) => void;
      resetIdentity: () => void;
    };
  };
}
