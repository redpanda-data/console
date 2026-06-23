/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * React 19 (`@types/react@19`) removed the global `JSX` namespace in favour of
 * the scoped `React.JSX`. Console's own code was migrated to the scoped form,
 * but third-party packages still reference the global namespace — notably the
 * `react-markdown@8` that `@redpanda-data/ui@4.2.0` bundles, whose
 * `complex-types.ts` ships as source (so `skipLibCheck` cannot skip it) and uses
 * `keyof JSX.IntrinsicElements`. This ambient declaration restores the global
 * `JSX` namespace as a thin alias of `React.JSX` so those libraries keep
 * type-checking. Remove it once every consumer of the global namespace is on a
 * React 19-aware release.
 */
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type ElementType = ReactJSX.ElementType;
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}
