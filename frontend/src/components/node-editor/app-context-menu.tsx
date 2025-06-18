'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

import { useClientPosition } from '@/components/node-editor/hooks/use-client-position';
import { schemaLoader } from '@/components/node-editor/redpanda-connect/schema-loader';
import type { SchemaNodeConfig } from '@/components/node-editor/redpanda-connect/schema-loader';
import { useAppStore } from '@/components/node-editor/store';
import { Badge } from '@/components/redpanda-ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/redpanda-ui/context-menu';
import { Input } from '@/components/redpanda-ui/input';
import { getStatusBadgeStyle } from './command-palette';
import { getComponentSections } from './component-sections';

export default function AppContextMenu({ children }: { children: ReactNode }) {
  const [position, setPosition] = useClientPosition();
  const [searchQuery, setSearchQuery] = useState('');
  const addRedpandaNode = useAppStore((state) => state.addRedpandaNode);

  const onRedpandaNodeClick = (schemaConfig: SchemaNodeConfig) => {
    if (!position) {
      return;
    }

    addRedpandaNode(schemaConfig, position);
  };

  // Get filtered schema nodes based on search - show all component types
  const filteredNodes = searchQuery ? schemaLoader.searchNodeConfigs(searchQuery) : [];

  // Get section configurations from shared utility
  const sections = getComponentSections();

  return (
    <div className="h-full w-full bg-gray-100" onContextMenu={setPosition}>
      <ContextMenu>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-80">
          {/* Search */}
          <div className="p-2">
            <Input
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
            />
          </div>

          <ContextMenuSeparator />

          {/* Redpanda Connect Components */}
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Components</div>

          {searchQuery ? (
            // Show filtered results when searching
            <div className="max-h-64 overflow-y-auto">
              {filteredNodes.length > 0 ? (
                filteredNodes.map((config) => (
                  <ContextMenuItem
                    key={config.id}
                    className="flex items-center justify-between cursor-pointer p-2"
                    onClick={() => onRedpandaNodeClick(config)}
                  >
                    <div className="flex items-center space-x-2 flex-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{config.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{config.summary}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 ml-2">
                      <Badge variant="secondary" className="text-xs">
                        {config.category}
                      </Badge>
                      <Badge className={`text-xs ${getStatusBadgeStyle(config.status)}`}>{config.status}</Badge>
                    </div>
                  </ContextMenuItem>
                ))
              ) : (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No components found matching "{searchQuery}"
                </div>
              )}
            </div>
          ) : (
            // Show categorized view when not searching
            sections.map((section) => {
              const Icon = section.icon;
              return (
                <ContextMenuSub key={section.title}>
                  <ContextMenuSubTrigger className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{section.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {section.configs.length}
                    </Badge>
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-72 max-h-64 overflow-y-auto">
                    {section.configs.length > 0 ? (
                      section.configs.map((config) => (
                        <ContextMenuItem
                          key={config.id}
                          className="flex items-center justify-between cursor-pointer p-2"
                          onClick={() => onRedpandaNodeClick(config)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{config.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{config.summary}</div>
                          </div>
                          <Badge className={`text-xs ml-2 ${getStatusBadgeStyle(config.status)}`}>
                            {config.status}
                          </Badge>
                        </ContextMenuItem>
                      ))
                    ) : (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No {section.title.toLowerCase()} available
                      </div>
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              );
            })
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
