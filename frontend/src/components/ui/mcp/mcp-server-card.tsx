import type { MCPServer } from 'react-query/api/remote-mcp';
import { MCPServer_State } from 'react-query/api/remote-mcp';
import type { HTMLAttributes } from 'react';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { pluralizeWithNumber } from 'utils/string';

import { Badge } from '../../redpanda-ui/components/badge';
import { Button } from '../../redpanda-ui/components/button';
import { Checkbox } from '../../redpanda-ui/components/checkbox';
import { Label } from '../../redpanda-ui/components/label';
import { cn } from '../../redpanda-ui/lib/utils';

export type MCPServerCardListProps = HTMLAttributes<HTMLDivElement> & {
  servers: MCPServer[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  testId?: string;
  showCheckbox?: boolean;
  idPrefix?: string;
};

export const MCPServerCardList = ({
  servers,
  value = [],
  onValueChange,
  className,
  testId,
  showCheckbox = true,
  idPrefix = 'default',
  ...props
}: MCPServerCardListProps) => {
  const handleToggle = (serverId: string) => {
    const newValue = value.includes(serverId) ? value.filter((id) => id !== serverId) : [...value, serverId];
    onValueChange?.(newValue);
  };

  return (
    <div className={cn('w-full space-y-3', className)} data-testid={testId} {...props}>
      <div className="divide-y rounded-md border">
        {servers.map((server) => {
          const isSelected = value.includes(server.id);
          return (
            <MCPServerRow
              idPrefix={idPrefix}
              isSelected={isSelected}
              key={server.id}
              onToggle={() => handleToggle(server.id)}
              server={server}
              showCheckbox={showCheckbox}
            />
          );
        })}
      </div>

      <AllAvailableTools selectedServerIds={value} servers={servers} />
    </div>
  );
};

type MCPServerRowProps = {
  server: MCPServer;
  isSelected: boolean;
  onToggle: () => void;
  showCheckbox?: boolean;
  idPrefix?: string;
};

const MCPServerRow = ({ server, isSelected, onToggle, showCheckbox = true, idPrefix = 'default' }: MCPServerRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toolNames = Object.keys(server.tools || {});
  const isDeleted = server.state === MCPServer_State.UNSPECIFIED && server.displayName.includes('(deleted)');

  const MAX_VISIBLE_TOOLS = 6;
  const visibleTools = toolNames.slice(0, MAX_VISIBLE_TOOLS);
  const remainingCount = toolNames.length - MAX_VISIBLE_TOOLS;

  const rowContent = (
    <div className="flex flex-1 items-center gap-3">
      {toolNames.length > 0 && (
        <Button
          className="h-5 w-5 shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          size="icon"
          variant="ghost"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      )}
      {toolNames.length === 0 && <div className="w-5 shrink-0" />}

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isDeleted && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
        <span className={cn('truncate font-medium', isDeleted && 'text-destructive')}>{server.displayName}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {toolNames.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {pluralizeWithNumber(toolNames.length, 'tool')}
          </Badge>
        )}
        {isDeleted && (
          <Badge variant="destructive" className="text-xs">
            Missing
          </Badge>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn('transition-colors', isSelected && 'bg-secondary/5')}>
      <div className={cn('flex items-center gap-3 px-3 py-2', showCheckbox && 'hover:bg-accent/50')}>
        {showCheckbox && (
          <Checkbox
            checked={isSelected}
            className="shrink-0"
            id={`mcp-server-${idPrefix}-${server.id}`}
            onCheckedChange={onToggle}
          />
        )}
        {showCheckbox ? (
          <Label htmlFor={`mcp-server-${idPrefix}-${server.id}`} className="flex flex-1 cursor-pointer items-center">
            {rowContent}
          </Label>
        ) : (
          rowContent
        )}
      </div>

      {isExpanded && toolNames.length > 0 && (
        <div className="border-t bg-muted/30 px-3 py-2 pl-11">
          <div className="flex flex-wrap gap-1.5">
            {visibleTools.map((toolName) => (
              <span
                className="inline-flex items-center rounded bg-secondary/10 px-1.5 py-0.5 font-medium text-secondary text-xs"
                key={toolName}
              >
                {toolName}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="inline-flex items-center rounded bg-secondary/10 px-1.5 py-0.5 font-medium text-secondary text-xs">
                +{remainingCount} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

type AllAvailableToolsProps = {
  servers: MCPServer[];
  selectedServerIds: string[];
};

const AllAvailableTools = ({ servers, selectedServerIds }: AllAvailableToolsProps) => {
  const selectedServers = useMemo(
    () => servers.filter((server) => selectedServerIds.includes(server.id)),
    [servers, selectedServerIds]
  );

  // Collect all tools from all selected servers
  const allTools = useMemo(() => {
    const toolsSet = new Set<string>();
    for (const server of selectedServers) {
      const toolNames = Object.keys(server.tools || {});
      for (const toolName of toolNames) {
        toolsSet.add(toolName);
      }
    }
    return Array.from(toolsSet).sort();
  }, [selectedServers]);

  if (allTools.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">All Available Tools ({allTools.length})</p>
      <div className="flex flex-wrap gap-1.5">
        {allTools.map((toolName) => (
          <span
            className="inline-flex items-center rounded bg-secondary/10 px-1.5 py-0.5 font-medium text-secondary text-xs"
            key={toolName}
          >
            {toolName}
          </span>
        ))}
      </div>
    </div>
  );
};
