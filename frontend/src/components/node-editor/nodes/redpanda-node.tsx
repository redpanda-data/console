import type { WorkflowNodeProps } from '@/components/node-editor/nodes';
import { NODE_SIZE } from '@/components/node-editor/nodes/nodes-config';
import type { SchemaNodeConfig } from '@/components/node-editor/redpanda-connect/schema-loader';
import { useAppStore } from '@/components/node-editor/store';
import { Badge } from '@/components/redpanda-ui/badge';
import { cn } from '@/lib/utils';
import { type ReactNode, useCallback } from 'react';
import { BaseNode } from '../base-node';
import { getCategoryBadgeStyle, getCategoryIcon } from '../command-palette';
import { NodeHeader, NodeHeaderActions, NodeHeaderDeleteAction, NodeHeaderIcon, NodeHeaderTitle } from '../node-header';
import { NodeStatusIndicator } from '../node-status-indicator';

export interface RedpandaNodeProps extends WorkflowNodeProps {
  data: WorkflowNodeProps['data'] & { schemaConfig: SchemaNodeConfig };
  children?: ReactNode;
}

export function RedpandaNode({ data, id, children, ...props }: RedpandaNodeProps) {
  if (!data.schemaConfig) {
    return null;
  }

  const openNodeInspector = useAppStore((state) => state.openNodeInspector);

  const onNodeClick = useCallback(() => openNodeInspector(id), [id, openNodeInspector]);

  const categoryColor = getCategoryBadgeStyle(data.schemaConfig.category);
  const CategoryIcon = getCategoryIcon(data.schemaConfig.category);

  return (
    <NodeStatusIndicator status={data?.status}>
      <BaseNode className="p-1" style={{ ...NODE_SIZE }} onClick={onNodeClick} {...props}>
        <NodeHeader>
          <NodeHeaderIcon>
            <CategoryIcon aria-label={data.schemaConfig.category} />
          </NodeHeaderIcon>
          <NodeHeaderTitle>
            <div className="flex items-center gap-2">
              {data.schemaConfig.name}
              <Badge variant="outline" className={cn(categoryColor, 'text-xs')}>
                {data.schemaConfig.category}
              </Badge>
            </div>
          </NodeHeaderTitle>
          <NodeHeaderActions>
            <NodeHeaderDeleteAction />
          </NodeHeaderActions>
        </NodeHeader>
        {children}
      </BaseNode>
    </NodeStatusIndicator>
  );
}
