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
 * Build-time shim: react-onclickoutside@6 statically imports the `findDOMNode` React 19 removed,
 * breaking ESM linking in the production bundle even though Console never renders its only consumer
 * (@redpanda-data/ui's DatePicker). This identity HOC drops that import. Click-outside is a
 * deliberate no-op; if a DatePicker is ever rendered, drop the shim and upgrade react-datepicker.
 */
export const IGNORE_CLASS_NAME = 'ignore-react-onclickoutside';

export default function onClickOutside<TComponent>(WrappedComponent: TComponent, _config?: unknown): TComponent {
  return WrappedComponent;
}
