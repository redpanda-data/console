import React, { useEffect, useMemo, useState } from 'react';
import { useNodes, useOnSelectionChange, Node/*, useKeyPress*/ } from 'reactflow';

import { GraphNode, NodeData, NodeDataCore, NodeRunState, RunResult, DeploymentTraceEvents, DeploymentTracesFlattened, TraceEventCategory, RunEvent, NodeAction } from './NodeData';

function eventsByPathOrLabel(data: NodeData, thing?: TraceEventCategory): RunEvent[] {
  if (!thing || !data.path) {
    return [];
  }
  if ((data.label || '').length > 0) {
    const result = thing[data.label || ''];
    if (result) {
      return result;
    }
  }
  return thing[data.path] || [];
};

function existsByPathOrLabel(data: NodeData, thing?: { [key: string]: {} }): boolean {
  if (!thing || !data.path) {
    return false;
  }
  if ((data.label || '').length > 0) {
    const result = thing[data.label || ''];
    if (result) {
      return true;
    }
  }
  return thing[data.path] !== undefined;
};

/*
function createCopyPatch(sourceData: NodeAction, destData: NodeDataCore): NodeAction {
  // First, see if the destination node has an action for adding the same kind
  // as our copy source.
  let destActions = destData.actions || [];
  for ( let i = 0; i < destActions.length; i++ ) {
    let action = destActions[i];
    if ( action.operation === "add" && action.kind === sourceData.kind ) {
      return {
        operation: "copy",
        path: action.path + "/-",
        value: sourceData.path,
      };
    }
  }

  if ( sourceData.kind !== destData.kind ) {
    throw new Error(`cannot paste a ${sourceData.kind} component onto a ${destData.kind}`);
  }
  return {
    operation: "copy",
    path: destData.path,
    value: sourceData.path,
  };
}
*/

export default function ControlView({
  runResult,
  deploymentTraces,
  onSelectionChanged,
}: {
  runResult: RunResult | null;
  deploymentTraces: DeploymentTraceEvents | null;
  onSelectionChanged: (data: GraphNode | null) => void;
  submitPatches: (patches: NodeAction[], after: () => void) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const allNodes = useNodes<NodeData>();
  const [selectedNode, setSelectedNode] = useState<NodeDataCore | null>(null);

  // None of this is working, it unfortunately captures events within the node editor which is very bad

  /*
  // Copy/paste functionality
  const [copiedNode, setCopiedNode] = useState<{
    operation: string;
  } & NodeDataCore | null>(null);

  // const deletePressed = useKeyPress('Delete');
  // const undoPressed = useKeyPress(['Meta+z', 'Strg+z']);
  // const redoPressed = useKeyPress(['Meta+Shift+z', 'Strg+Shift+z']);
  // const copyPressed = useKeyPress(['Meta+c', 'Strg+c']);
  // const cutPressed = useKeyPress(['Meta+x', 'Strg+x']);
  // const pastePressed = useKeyPress(['Meta+v', 'Strg+v']);

  useEffect(() => {
    if ( !deletePressed || !selectedNode ) {
      return;
    }
    submitPatches([{
      operation: 'delete',
      path: selectedNode.path,
    }], () => {});
  }, [deletePressed, submitPatches, selectedNode]);

  useEffect(() => {
    if ( undoPressed ) {
      onUndo();
    }
  }, [undoPressed, onUndo]);

  useEffect(() => {
    if ( !copyPressed || !selectedNode ) {
      return;
    }
    setCopiedNode({
      operation: "copy",
      type: selectedNode.type,
      kind: selectedNode.kind,
      path: selectedNode.path,
    });
  }, [copyPressed, selectedNode]);

  useEffect(() => {
    if ( !cutPressed || !selectedNode ) {
      return;
    }
    setCopiedNode({
      operation: "cut",
      type: selectedNode.type,
      kind: selectedNode.kind,
      path: selectedNode.path,
    });
  }, [cutPressed, selectedNode]);

  useEffect(() => {
    if ( !pastePressed || !copiedNode || !selectedNode ) {
      return;
    }
    let patches = [ createCopyPatch(copiedNode, selectedNode) ];
    if ( copiedNode.operation === "cut" ) {
      patches.push({
        operation: 'delete',
        path: copiedNode.path,
      });
    }
    submitPatches(patches, () => {
      if ( copiedNode.operation === "cut" ) {
        setCopiedNode(null);
      }
    })
  }, [pastePressed, copiedNode, selectedNode, submitPatches]);
  */

  useOnSelectionChange({
    onChange: useMemo(() => ({ nodes }: { nodes: Node[] }) => {
      let target: GraphNode | null = null;
      if (nodes.length > 0) {
        target = nodes[0];
      }
      setSelectedNode(target?.data || null);
      onSelectionChanged(target);
    }, [onSelectionChanged]),
  });

  const deploymentTracesFlattened = useMemo(() => {
    return DeploymentTracesFlattened(deploymentTraces || {});
  }, [deploymentTraces]);

  useEffect(() => {
    allNodes.forEach((n) => {
      if (!n.data) {
        return;
      }
      if (n.data.setSelectedNode) {
        n.data.setSelectedNode(selectedNode);
      }
      if (n.data.setRunState) {
        switch (n.data?.kind) {
          case 'input':
            if (n.data.setEvents) {
              n.data.setEvents([
                ...eventsByPathOrLabel(n.data, deploymentTracesFlattened.JustFlat.input_events || {}),
                ...eventsByPathOrLabel(n.data, runResult?.input_events) || [],
              ])
            };
            n.data.setRunState(
              (runResult?.error ? NodeRunState.Error : null) ||
              (existsByPathOrLabel(n.data, runResult?.missing_inputs) ? NodeRunState.NeedsMock : null) ||
              (existsByPathOrLabel(n.data, runResult?.components_mocked) ? NodeRunState.IsMocked : null) ||
              NodeRunState.None
            );
            break;
          case 'processor':
            if (n.data.setEvents) {
              n.data.setEvents([
                ...eventsByPathOrLabel(n.data, deploymentTracesFlattened.JustFlat.processor_events || {}),
                ...eventsByPathOrLabel(n.data, runResult?.processor_events) || [],
              ])
            };
            n.data.setRunState(
              (runResult?.error ? NodeRunState.Error : null) ||
              (existsByPathOrLabel(n.data, runResult?.missing_processors) ? NodeRunState.NeedsMock : null) ||
              (existsByPathOrLabel(n.data, runResult?.components_mocked) ? NodeRunState.IsMocked : null) ||
              NodeRunState.None
            );
            break;
          case 'output':
            if (n.data.setEvents) {
              n.data.setEvents([
                ...eventsByPathOrLabel(n.data, deploymentTracesFlattened.JustFlat.output_events || {}),
                ...eventsByPathOrLabel(n.data, runResult?.output_events) || [],
              ])
            };
            n.data.setRunState(runResult?.error ? NodeRunState.Error : NodeRunState.None);
            break;
          default:
            n.data.setRunState(NodeRunState.None);
        }
      }
    });
  }, [allNodes, selectedNode, runResult, deploymentTracesFlattened]);

  return <></>
};
