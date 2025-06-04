'use client';

import { useReactFlow } from '@xyflow/react';
import { Command, GripVertical, Plus } from 'lucide-react';
import { type ComponentProps, useCallback, useRef, useState } from 'react';

import { iconMapping } from '@/components/node-editor/data/icon-mapping';
import { type AppNode, type NodeConfig, createNodeByType } from '@/components/node-editor/nodes';
import { nodesConfig } from '@/components/node-editor/nodes/nodes-config';
import { SettingsDialog } from '@/components/node-editor/settings-dialog';
import { useAppStore } from '@/components/node-editor/store';
import type { AppStore } from '@/components/node-editor/store/app-store';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/redpanda-ui/sidebar';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className="border-r-0" side="right" {...props}>
      <SidebarHeader className="py-0">
        <div className="flex gap-2 px-1 h-14 items-center ">
          <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Command className="size-3" />
          </div>
          <span className="truncate font-semibold">Workflow Editor</span>
        </div>
        <SidebarMenu>
          {Object.values(nodesConfig).map((item) => (
            <DraggableItem key={item.title} {...item} />
          ))}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <SettingsDialog />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

const selector = (state: AppStore) => ({
  addNode: state.addNode,
  checkForPotentialConnection: state.checkForPotentialConnection,
  resetPotentialConnection: state.resetPotentialConnection,
});

function DraggableItem(props: NodeConfig) {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode, checkForPotentialConnection, resetPotentialConnection } = useAppStore(useShallow(selector));
  const [isDragging, setIsDragging] = useState(false);

  const onClick = useCallback(() => {
    const newNode: AppNode = createNodeByType({
      type: props.id,
      position: screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    });

    addNode(newNode);
  }, [props, addNode, screenToFlowPosition]);

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/reactflow', JSON.stringify(props));
      setIsDragging(true);
    },
    [props],
  );

  const lastDragPos = useRef({ x: 0, y: 0 });
  const onDrag = useCallback(
    (e: React.DragEvent) => {
      const lastPos = lastDragPos.current;
      // we need to keep track of the last drag position to avoid unnecessary calculations
      // the drag api constantly fires events even if the mouse is not moving
      if (lastPos.x === e.clientX && lastPos.y === e.clientY) {
        return;
      }
      lastDragPos.current = { x: e.clientX, y: e.clientY };

      const flowPosition = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      const handles = nodesConfig[props.id].handles.map((handle) => handle.type);
      const handleType = handles.reduce(
        (acc, type) => {
          if (acc === 'none') return type;
          if (acc !== 'both' && acc !== type) return 'both';
          return acc;
        },
        'none' as 'both' | 'none' | 'source' | 'target',
      );

      if (handleType === 'none') return;

      checkForPotentialConnection(flowPosition, {
        type: handleType === 'both' ? undefined : handleType,
      });
    },
    [screenToFlowPosition, checkForPotentialConnection, props.id],
  );

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
    resetPotentialConnection();
  }, [resetPotentialConnection]);

  const IconComponent = props?.icon ? iconMapping[props.icon] : undefined;

  return (
    <SidebarMenuItem
      className={cn(
        'relative border-2 active:scale-[.99] rounded-md',
        isDragging ? 'border-green-500' : 'border-gray-100',
      )}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onClick={onClick}
      draggable
      key={props.title}
    >
      {isDragging && (
        <span role="presentation" className="absolute -top-3 -right-3 rounded-md border-2 border-green-500 bg-card">
          <Plus className="size-4" />
        </span>
      )}
      <SidebarMenuButton className="bg-card cursor-grab active:cursor-grabbing">
        {IconComponent ? <IconComponent aria-label={props?.icon} /> : null}
        <span>{props.title}</span>
        <GripVertical className="ml-auto" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
