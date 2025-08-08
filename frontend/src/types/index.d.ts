declare module '*.module.scss';
declare module '*.module.sass';
declare module '*.module.less';
declare module '*.module.css';

declare module '*.svg';
declare module '*.png';
declare module '*.jpg';

// Heap Analytics types
declare global {
  interface Window {
    heap: {
      identify: (email: string) => void;
      track: (eventName: string, eventData?: any) => void;
      addUserProperties: (properties: Record<string, any>) => void;
      addEventProperties: (properties: Record<string, any>) => void;
      resetIdentity: () => void;
    };
  }
}
