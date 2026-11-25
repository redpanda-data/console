import { Children, isValidElement, type ReactNode } from 'react';

import type { AgentItem } from './primitives/base-value-agent';

export function childrenText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      return isValidElement<{ children?: ReactNode }>(child) ? childrenText(child.props.children) : '';
    })
    .join('');
}

export function agentItems(children: ReactNode): AgentItem[] {
  const items = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: unknown; children?: ReactNode; disabled?: boolean; render?: ReactNode }>(child)) {
      return [];
    }
    const { value, children: content, disabled } = child.props;
    return typeof value === 'string'
      ? [{ value, label: childrenText(content) || value, disabled }]
      : [...agentItems(content), ...agentItems(child.props.render)];
  });
  const unique = new Map<string, AgentItem>();
  for (const item of items) {
    if (!unique.has(item.value)) {
      unique.set(item.value, item);
    }
  }
  return [...unique.values()];
}
