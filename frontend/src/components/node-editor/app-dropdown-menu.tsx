import { iconMapping } from '@/components/node-editor/data/icon-mapping';
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
            const IconComponent = item?.icon ? iconMapping[item.icon] : undefined;
            return (
              <a key={item.title} onClick={() => onAddNode(item.id)}>
                <DropdownMenuItem className="flex items-center space-x-2">
                  {IconComponent ? <IconComponent aria-label={item?.icon} /> : null}
                  <span>New {item.title}</span>
                </DropdownMenuItem>
              </a>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
