import { useCallback } from 'react';

import { BaseNode } from '@/components/node-editor/base-node';
// import { useWorkflowRunner } from '@/components/node-editor/hooks/use-workflow-runner';
import {
  NodeHeader,
  NodeHeaderActions,
  NodeHeaderDeleteAction,
  NodeHeaderIcon,
  NodeHeaderTitle,
} from '@/components/node-editor/node-header';
import { NodeStatusIndicator } from '@/components/node-editor/node-status-indicator';
import type { WorkflowNodeData } from '@/components/node-editor/nodes';
import { NODE_SIZE } from '@/components/node-editor/nodes/nodes-config';
import { useAppStore } from '@/components/node-editor/store';

// This is an example of how to implement the WorkflowNode component. All the nodes in the Workflow Builder example
// are variations on this CustomNode defined in the index.tsx file.
// You can also create new components for each of your nodes for greater flexibility.
function WorkflowNode({
  id,
  data,
  children,
  type,
}: {
  id: string;
  data: WorkflowNodeData;
  children?: React.ReactNode;
  type?: string;
}) {
  // const { runWorkflow } = useWorkflowRunner();
  const openNodeInspector = useAppStore((state) => state.openNodeInspector);
  // const onClick = useCallback(() => runWorkflow(id), [id, runWorkflow]);
  
  // Don't open inspector for common nodes (transform, join, branch)
  const commonNodeTypes = ['transform-node', 'join-node', 'branch-node'];
  const shouldOpenInspector = !commonNodeTypes.includes(type || '');
  
  const onNodeClick = useCallback(() => {
    if (shouldOpenInspector) {
      openNodeInspector(id);
    }
  }, [id, openNodeInspector, shouldOpenInspector]);

  const IconComponent = data?.icon;

  return (
    <NodeStatusIndicator status={data?.status}>
      <BaseNode className="p-1" style={{ ...NODE_SIZE }} onClick={onNodeClick}>
        <NodeHeader>
          <NodeHeaderIcon>{IconComponent ? <IconComponent /> : null}</NodeHeaderIcon>
          <NodeHeaderTitle>{data?.title}</NodeHeaderTitle>
          <NodeHeaderActions>
            <NodeHeaderDeleteAction />
          </NodeHeaderActions>
        </NodeHeader>
        {children}
      </BaseNode>
    </NodeStatusIndicator>
  );
}

export default WorkflowNode;
