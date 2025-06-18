'use client';

import { useShallow } from 'zustand/react/shallow';

import { ConfigForm } from '@/components/node-editor/redpanda-connect/config-form';
import { useAppStore } from '@/components/node-editor/store';
import { Badge } from '@/components/redpanda-ui/badge';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from '@/components/redpanda-ui/tabs';
import { Info } from 'lucide-react';
import { getCategoryBadgeStyle, getCategoryIcon, getStatusBadgeStyle } from './command-palette';
import { NodeAsciidoc } from './node-asciidoc';

interface NodeInspectorProps {
  onClose: () => void;
}

export function NodeInspector({ onClose }: NodeInspectorProps) {
  const { nodes, selectedNodeId } = useAppStore(
    useShallow((state) => ({
      nodes: state.nodes,
      selectedNodeId: state.selectedNodeId,
    })),
  );

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  // Don't show inspector for transform, join, and branch nodes
  const excludedNodeTypes = ['transform-node', 'join-node', 'branch-node'];
  const shouldShowInspector = selectedNode && !excludedNodeTypes.includes(selectedNode.type || '');

  if (!selectedNode || !shouldShowInspector) {
    onClose();
    return (
      <div className="w-full h-full flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Node Inspector</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Info className="h-8 w-8 mx-auto mb-2" />
            <p>Select a node to view its configuration</p>
          </div>
        </div>
      </div>
    );
  }

  const nodeData = selectedNode.data;
  const { schemaConfig } = nodeData;

  const nodeTitle = schemaConfig?.name;
  const CategoryIcon = getCategoryIcon(schemaConfig?.category || '');

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col gap-2 p-6 border-b">
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CategoryIcon className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{nodeTitle}</h2>
          </div>
          <Badge className={`text-xs ${getCategoryBadgeStyle(schemaConfig?.category || '')}`}>
            {schemaConfig?.category}
          </Badge>
          <Badge className={`text-xs ${getStatusBadgeStyle(schemaConfig?.status || '')}`}>{schemaConfig?.status}</Badge>
          {schemaConfig?.version && (
            <Badge variant="outline" className="text-xs">
              v{schemaConfig?.version}
            </Badge>
          )}
        </div>
        {schemaConfig?.summary && <p className="text-sm text-muted-foreground mb-3">{schemaConfig?.summary}</p>}
        {schemaConfig?.categories && schemaConfig?.categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            <h4 className="text-sm font-medium mb-2">Schema Categories</h4>
            {/* Categories underneath description */}
            {schemaConfig.categories && schemaConfig.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {schemaConfig.categories.map((category) => (
                  <Badge key={category} variant="outline" className="text-xs">
                    {category}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
        <Tabs defaultValue="overview" className="w-full flex flex-col flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
          </TabsList>

          <TabsContents className="flex-1 overflow-hidden h-[400px]">
            <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 h-full">
              <div>
                {schemaConfig?.description && (
                  <div className="text-sm max-h-128 overflow-y-auto">
                    <NodeAsciidoc content={schemaConfig.description} />
                  </div>
                )}
              </div>
            </TabsContent>
            {schemaConfig?.config && (
              <TabsContent value="config" className="flex-1 p-6 h-full">
                <div className="max-h-128 overflow-y-auto p-1">
                  <ConfigForm root={schemaConfig.config} nodeId={selectedNode.id} />
                </div>
              </TabsContent>
            )}
          </TabsContents>
        </Tabs>
      </div>
      <div className="border-t px-6 py-3 bg-muted/30">
        <div>
          <h4 className="text-xs font-medium mb-2 uppercase tracking-wide text-muted-foreground">Component Details</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Type:</span>
              <span className="font-mono">{schemaConfig?.type}</span>
            </div>
            {schemaConfig?.version && (
              <div className="flex gap-2">
                <span className="text-muted-foreground">Available since:</span>
                <span className="font-mono">v{schemaConfig.version}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-muted-foreground">Node ID:</span>
              <span className="font-mono text-xs truncate">{selectedNode.id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
