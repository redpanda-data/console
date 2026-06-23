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
 * Build-time shim for react-onclickoutside.
 *
 * react-onclickoutside@6 statically imports `findDOMNode` from react-dom, which
 * React 19 removed — this breaks the production bundle's ESM linking even though
 * Console never renders the only consumer (@redpanda-data/ui's
 * react-datepicker-backed DatePicker). This identity HOC drops the findDOMNode
 * import and returns the wrapped component unchanged. Click-outside behaviour is
 * intentionally a no-op because the datepicker is dead code here; if a DatePicker
 * is ever rendered, remove this shim and upgrade react-datepicker to a
 * React 19-compatible release instead.
 */
export const IGNORE_CLASS_NAME = 'ignore-react-onclickoutside';

export default function onClickOutside<TComponent>(WrappedComponent: TComponent, _config?: unknown): TComponent {
  return WrappedComponent;
}
