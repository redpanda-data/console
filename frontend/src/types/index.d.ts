declare module '*.module.scss';
declare module '*.module.sass';
declare module '*.module.less';
declare module '*.module.css';

declare module '*.svg';
declare module '*.png';
declare module '*.jpg';

// Monaco's built-in basic-language modules ship without type declarations.
declare module 'monaco-editor/esm/vs/basic-languages/sql/sql' {
  import type { languages } from 'monaco-editor';

  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage & {
    keywords: string[];
    operators: string[];
    builtinFunctions: string[];
    builtinVariables: string[];
  };
}

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
