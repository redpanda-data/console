import { useState, useRef } from 'react';

import { Tree, GraphNode, DeploymentTraceEvents, RunResult, NodeDataCore } from './NodeData';
/* import classNames from 'classnames';
import ControlPanel from '../ControlPanel';
import GraphInfoPanel from './GraphInfoPanel';
import NodeRunInfoTab from './NodeRunInfoTab';
import NodeRunConfigTab from './NodeRunConfigTab';
import NodeEditorTab from './NodeEditorTab';

import styles from './Graph.module.css'; */
import { RenderGraph } from './Render';

function graphMatchesNodeData(graphNode: GraphNode, data: NodeDataCore | null) {
    if (!graphNode.data.path && !data) {
        return true;
    }
    if (!data) {
        return false;
    }
    return graphNode.data.label === data.label &&
        graphNode.data.type === data.type &&
        graphNode.data.kind === data.kind &&
        graphNode.data.path === data.path;
}

// enum Tab {
//     Edit,
//     RunResult,
//     RunConfig,
// }

export type CachedRunInfo = {
    UpdatedAt: Date;
    TestRunResult?: RunResult;
    DeploymentTraceEvents?: DeploymentTraceEvents;
};

export default function Graph({
    tree,
}: {
    tree: Tree;
}) {
    // For controlling the graph view
    const [setSelectionTo] = useState<string | number>(0);
    const [selectedData, setSelectedData] = useState<NodeDataCore | null>(null);

    // Cached run info allows sub components to access traces without redrawing
    // everything
    const cachedRunInfoRef = useRef<CachedRunInfo>({ UpdatedAt: new Date() });


    return <>
        <RenderGraph
            tree={tree}
            nodeHooks={{
                isReadOnly: () => true,
                headlessAction: () => { },
                openActionModal: () => { }
            }}
            getRunInfo={() => {
                return cachedRunInfoRef.current;
            }}
            setSelectionTo={setSelectionTo}
            onSelectionChanged={(graphData: GraphNode | null) => {
                if (!graphData ||
                    !graphData.data.path ||
                    !graphData.data.type ||
                    !graphData.data.kind) {
                    setSelectedData(null);
                    return;
                }
                if (!graphMatchesNodeData(graphData, selectedData)) {
                    setSelectedData(graphData.data);
                }
            }}
            submitPatches={() => { }}
            onRedo={() => { }}
            onUndo={() => { }}
        />
    </>;
}
