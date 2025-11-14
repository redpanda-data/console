/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Background, type Edge, Handle, type Node, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Item, ItemContent, ItemTitle } from 'components/redpanda-ui/components/item';
import { Text } from 'components/redpanda-ui/components/typography';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import type { CSSProperties } from 'react';

interface ShadowLinkDiagramProps {
  shadowLink: ShadowLink;
}

const SourceClusterNode = ({ data }: { data: { brokers: string[] } }) => (
  <Item className="min-w-60 bg-background" size="sm" variant="outline">
    <ItemContent>
      <ItemTitle>Source cluster</ItemTitle>
      <div className="flex flex-col gap-1 text-muted-foreground text-xs">
        {data.brokers.map((broker) => (
          <Text key={broker} variant={'muted'}>
            {broker}
          </Text>
        ))}
      </div>
    </ItemContent>
    <Handle position={Position.Right} type="source" />
  </Item>
);

const ShadowClusterNode = () => (
  <Item className="min-w-60 bg-background" size="sm" variant="outline">
    <Handle position={Position.Left} type="target" />
    <ItemContent>
      <ItemTitle>Shadow cluster</ItemTitle>
      <div className="text-muted-foreground text-xs">
        <Text variant={'muted'}>This cluster </Text>
      </div>
    </ItemContent>
  </Item>
);

const nodeTypes = {
  sourceCluster: SourceClusterNode,
  shadowCluster: ShadowClusterNode,
};

const edgeStyle: CSSProperties = {
  stroke: '#9ca3af',
  strokeWidth: 2,
  strokeDasharray: '5,5',
};

export const ShadowLinkDiagram = ({ shadowLink }: ShadowLinkDiagramProps) => {
  const brokers = shadowLink.configurations?.clientOptions?.bootstrapServers ?? [];

  const nodes: Node[] = [
    {
      id: 'source',
      type: 'sourceCluster',
      position: { x: 50, y: 50 },
      data: {
        brokers,
      },
    },
    {
      id: 'shadow',
      type: 'shadowCluster',
      position: { x: 600, y: 50 },
      data: {},
    },
  ];

  const edges: Edge[] = [
    {
      id: 'source-to-shadow',
      source: 'source',
      target: 'shadow',
      type: 'straight',
      style: edgeStyle,
      animated: true,
    },
  ];

  return (
    <Card size="full">
      <CardContent>
        <div className="relative h-[200px] w-full">
          <ReactFlowProvider>
            <ReactFlow
              edges={edges}
              elementsSelectable={false}
              fitView={true}
              nodes={nodes}
              nodesConnectable={false}
              nodesDraggable={false}
              nodeTypes={nodeTypes}
              panOnDrag={false}
              preventScrolling={false}
              zoomOnPinch={false}
              zoomOnScroll={false}
            >
              <Background />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </CardContent>
    </Card>
  );
};
