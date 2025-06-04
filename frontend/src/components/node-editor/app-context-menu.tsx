'use client';

import type { ReactNode } from 'react';

import { iconMapping } from '@/components/node-editor/data/icon-mapping';
import { useClientPosition } from '@/components/node-editor/hooks/use-client-position';
import { nodesConfig } from '@/components/node-editor/nodes/nodes-config';
import type { AppNodeType } from '@/components/node-editor/nodes/nodes-config';
import { useAppStore } from '@/components/node-editor/store';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/redpanda-ui/context-menu';

export default function AppContextMenu({ children }: { children: ReactNode }) {
  const [position, setPosition] = useClientPosition();
  const addNodeByType = useAppStore((s) => s.addNodeByType);

  const onItemClick = (nodeType: AppNodeType) => {
    if (!position) {
      return;
    }

    addNodeByType(nodeType, position);
  };

  return (
    <div className="h-full w-full bg-gray-100" onContextMenu={setPosition}>
      <ContextMenu>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          {Object.values(nodesConfig).map((item) => {
            const IconComponent = item?.icon ? iconMapping[item.icon] : undefined;
            return (
              // biome-ignore lint/a11y/useValidAnchor: TODO: Check if this is correct
              <a key={item.title} onClick={() => onItemClick(item.id)}>
                <ContextMenuItem className="flex items-center space-x-2">
                  {IconComponent ? <IconComponent aria-label={item?.icon} /> : null}
                  <span>New {item.title}</span>
                </ContextMenuItem>
              </a>
            );
          })}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
