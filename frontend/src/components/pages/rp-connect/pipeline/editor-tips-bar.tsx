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

import { Kbd } from 'components/redpanda-ui/components/kbd';
import { Lightbulb } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { altKey, formatShortcut, modKey, shiftKey } from 'utils/shortcuts';

/** Which editor surface the tips relate to — drives a different tip set. */
export type TipContext = 'yaml' | 'visual';

type Tip = { id: string; content: ReactNode };

// Small monospace key chip sized to sit inside a line of tip text.
const Key = ({ children }: { children: ReactNode }) => (
  <Kbd size="xs" variant="filled">
    {children}
  </Kbd>
);

function tipsFor(
  context: TipContext,
  { slashMenuEnabled, readOnly }: { slashMenuEnabled: boolean; readOnly: boolean }
): Tip[] {
  if (context === 'visual') {
    const tips: Tip[] = [
      { id: 'select', content: <>Click a node to {readOnly ? 'inspect' : 'edit'} it</> },
      {
        id: 'zoom',
        content: (
          <>
            Drag to pan, hold <Key>Z</Key> / <Key>{formatShortcut(altKey(), 'Z')}</Key> and click to zoom
          </>
        ),
      },
      {
        id: 'palette',
        content: (
          <>
            <Key>/</Key> to search nodes and actions
          </>
        ),
      },
    ];
    if (!readOnly) {
      tips.push({
        id: 'history',
        content: (
          <>
            <Key>{formatShortcut(modKey(), 'Z')}</Key> to undo, <Key>{formatShortcut(modKey(), shiftKey(), 'Z')}</Key> to
            redo
          </>
        ),
      });
    }
    return tips;
  }

  const tips: Tip[] = [];
  if (slashMenuEnabled && !readOnly) {
    tips.push({
      id: 'slash',
      content: (
        <>
          Press <Key>/</Key> to insert variables, secrets, and topics
        </>
      ),
    });
  }
  if (!readOnly) {
    tips.push({
      id: 'save',
      content: (
        <>
          Save with <Key>{formatShortcut(modKey(), 'S')}</Key>
        </>
      ),
    });
  }
  return tips;
}

/** Full-width strip of contextual usage tips beneath the editor (different sets for YAML vs. visual). */
export function EditorTipsBar({
  context,
  slashMenuEnabled = false,
  readOnly = false,
}: {
  context: TipContext;
  slashMenuEnabled?: boolean;
  readOnly?: boolean;
}) {
  const tips = tipsFor(context, { slashMenuEnabled, readOnly });
  if (tips.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Editor tips"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs"
    >
      <Lightbulb className="size-3.5 shrink-0 text-muted-foreground/70" />
      {tips.map((tip, i) => (
        <Fragment key={tip.id}>
          {i > 0 ? (
            <span aria-hidden className="text-muted-foreground/40">
              •
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">{tip.content}</span>
        </Fragment>
      ))}
    </aside>
  );
}
