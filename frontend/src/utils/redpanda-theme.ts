/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { redpandaTheme } from '@redpanda-data/ui';

/**
 * `@redpanda-data/ui` ships `Table.baseStyle` whose inner `th`/`td` styles
 * use the kebab-case key `border-bottom-color`. Emotion's `processStyleValue`
 * emits a `console.error` warning for every render. Until the lib is patched
 * upstream, wrap the baseStyle here so the key is renamed to
 * `borderBottomColor`. This is a targeted config override — no other
 * behaviour changes.
 */
function rewriteKebabBorderBottomColor<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = { ...obj };
  if (Object.hasOwn(out, 'border-bottom-color')) {
    out.borderBottomColor = out['border-bottom-color'];
    delete out['border-bottom-color'];
  }
  return out as T;
}

type BaseStyleFn = (props: unknown) => Record<string, unknown>;

function wrapTableBaseStyle(original: BaseStyleFn): BaseStyleFn {
  return (props) => {
    const result = original(props);
    const patched: Record<string, unknown> = { ...result };
    if (result.th && typeof result.th === 'object') {
      patched.th = rewriteKebabBorderBottomColor(result.th as Record<string, unknown>);
    }
    if (result.td && typeof result.td === 'object') {
      patched.td = rewriteKebabBorderBottomColor(result.td as Record<string, unknown>);
    }
    return patched;
  };
}

const tableComponent = (redpandaTheme as { components?: { Table?: { baseStyle?: BaseStyleFn } } }).components?.Table;
const patchedTable =
  tableComponent && typeof tableComponent.baseStyle === 'function'
    ? { ...tableComponent, baseStyle: wrapTableBaseStyle(tableComponent.baseStyle) }
    : tableComponent;

export const patchedRedpandaTheme = {
  ...redpandaTheme,
  components: {
    ...((redpandaTheme as { components?: Record<string, unknown> }).components ?? {}),
    ...(patchedTable ? { Table: patchedTable } : {}),
  },
} as typeof redpandaTheme;
