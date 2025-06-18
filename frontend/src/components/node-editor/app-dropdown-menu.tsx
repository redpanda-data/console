import type { NodeConfig } from '@/components/node-editor/nodes';
import { nodesConfig } from '@/components/node-editor/nodes/nodes-config';
import type { AppNodeType } from '@/components/node-editor/nodes/nodes-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/redpanda-ui/dropdown-menu';

export function AppDropdownMenu({
  onAddNode,
  filterNodes = () => true,
}: {
  onAddNode: (type: AppNodeType) => void;
  filterNodes?: (node: NodeConfig) => boolean;
}) {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger />
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Nodes</DropdownMenuLabel>
        {Object.values(nodesConfig)
          .filter(filterNodes)
          .map((item) => {
            const IconComponent = item?.icon;
            return (
              // biome-ignore lint/a11y/useValidAnchor: needed to use anchor for the react flow node
              <a key={item.title} onClick={(e) => { e.stopPropagation(); onAddNode(item.id); }}>
                <DropdownMenuItem className="flex items-center space-x-2">
                  {IconComponent ? <IconComponent /> : null}
                  <span>New {item.title}</span>
                </DropdownMenuItem>
              </a>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
