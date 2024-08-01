import { observer } from 'mobx-react';
import { Box } from '@redpanda-data/ui';
import { Pipeline } from '../../../protogen/redpanda/api/dataplane/v1alpha2/pipeline_pb';
import { useRef, useState } from 'react';
import exampleJson from '../../../assets/examplePipelineGraph.json';
import { RenderGraph } from './studio/editor/graph/Render';
import { GraphNode, NodeDataCore } from './studio/editor/graph/NodeData';
import { CachedRunInfo } from './studio/editor/graph/Graph';

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

export const PipelineGraph = observer((_p: {
    pipeline: Pipeline
}) => {

    // For controlling the graph view
    const [setSelectionTo] = useState<string | number>(0);
    const [selectedData, setSelectedData] = useState<NodeDataCore | null>(null);

    // Cached run info allows sub components to access traces without redrawing
    // everything
    const cachedRunInfoRef = useRef<CachedRunInfo>({ UpdatedAt: new Date() });


    return <Box width="100%" height="600px" background="hsl(215 50% 97%)">
        <RenderGraph
            tree={{
                stream: exampleJson.stream as any,
                resources: exampleJson.resources as any,

                has_undo: false,
                has_redo: false,
                read_only: true,
                observability: undefined
            }}

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
    </Box>
});
