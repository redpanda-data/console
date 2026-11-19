import type { JSX as ReactJSX } from 'react';

/** hast-util-to-jsx-runtime is framework-neutral and requires its consumer's JSX namespace. */
declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}
