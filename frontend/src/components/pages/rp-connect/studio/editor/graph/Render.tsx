import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, { MiniMap, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';

import { Tree, NodeHooks, GraphNode, GraphEdge, GraphItem, NodeAction } from './NodeData';
import { CachedRunInfo } from './Graph';
import { ComponentSummaryEditMode } from './ComponentSummaryEditMode';
import TreeBuilder from './TreeBuilder';
import ControlView from './ControlView';

import './Render.css';

export function RenderGraph({
    tree,
    nodeHooks,
    getRunInfo,
    setSelectionTo,
    onSelectionChanged,
    submitPatches,
    onUndo,
    onRedo,
}: {
    tree: Tree;
    nodeHooks: NodeHooks;
    getRunInfo: () => CachedRunInfo;
    setSelectionTo: string | number; // Either a path to a node to select, or a number that triggers refreshing to an empty selection
    onSelectionChanged: (data: GraphNode | null) => void;
    submitPatches: (patches: NodeAction[], after: () => void) => void;
    onUndo: () => void;
    onRedo: () => void;
}) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const [cachedRunInfo, setCachedRunInfo] = useState<CachedRunInfo>(getRunInfo());

    const nodeTypes = useMemo(() => ({
        componentEditMode: ComponentSummaryEditMode,
        componentTitleEditMode: ComponentSummaryEditMode,
        titleEditMode: ComponentSummaryEditMode,
    }), []);

    // Periodically check for new traces
    useEffect(() => {
        let lastAcquiredTime = 0;
        const pollFn = () => {
            const runInfo = getRunInfo();
            if (runInfo.UpdatedAt.getTime() > lastAcquiredTime) {
                setCachedRunInfo(runInfo);
                lastAcquiredTime = runInfo.UpdatedAt.getTime();
            }
        };

        setTimeout(pollFn, 1);
        const id = setInterval(pollFn, 1000);
        return () => {
            clearInterval(id);
        };
    }, [tree, getRunInfo]);

    useEffect(() => {
        const rawNodes = TreeBuilder({ tree, nodeHooks });
        setNodes(rawNodes.filter((n) => (n as GraphEdge).source === undefined).map((n: GraphItem) => {
            if (setSelectionTo === n.data?.path) {
                n.selected = true;
            }
            return n as GraphNode;
        }));
        setEdges(rawNodes.filter((n) => (n as GraphEdge).source !== undefined).map((n: GraphItem) => {
            return n as GraphEdge;
        }));
    }, [tree, nodeHooks, setNodes, setEdges, setSelectionTo]);

    return (
        <ReactFlow
            nodeTypes={nodeTypes}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodesConnectable={false}
            elementsSelectable={true}
            nodesDraggable={false}
            proOptions={{ hideAttribution: true }}
            fitView={true}
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
        >
            <MiniMap
                nodeColor={(node) => {
                    switch (node.className) {
                        case 'input':
                            return '#78dce8';
                        case 'buffer':
                            return '#fc9867';
                        case 'output':
                            return '#ff6188';
                        case 'processor':
                            return '#a9dc76';
                        case 'resource':
                            return '#ab9df2';
                        default:
                            return '#b1b1b7';
                    }
                }}
                nodeStrokeWidth={3}
            />
            <ControlView
                deploymentTraces={cachedRunInfo.DeploymentTraceEvents || null}
                onSelectionChanged={onSelectionChanged}
                runResult={cachedRunInfo.TestRunResult || null}
                onRedo={onRedo}
                onUndo={onUndo}
                submitPatches={submitPatches}
            />
        </ReactFlow>
    );
}
