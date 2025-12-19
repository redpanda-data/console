import type { MCPServer } from 'react-query/api/remote-mcp';
import type { HTMLAttributes } from 'react';
import { useMemo } from 'react';

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
    <div className={cn('w-full space-y-4', className)} data-testid={testId} {...props}>
      <div className="grid gap-2 md:grid-cols-2">
        {servers.map((server) => {
          const isSelected = value.includes(server.id);
          return (
            <MCPServerCard
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

type MCPServerCardProps = {
  server: MCPServer;
  isSelected: boolean;
  onToggle: () => void;
  showCheckbox?: boolean;
  idPrefix?: string;
};

const MCPServerCard = ({ server, isSelected, onToggle, showCheckbox = true, idPrefix = 'default' }: MCPServerCardProps) => {
  const toolNames = Object.keys(server.tools || {});

  const MAX_VISIBLE_TOOLS = 8;
  const visibleTools = toolNames.slice(0, MAX_VISIBLE_TOOLS);
  const remainingCount = toolNames.length - MAX_VISIBLE_TOOLS;

  const content = (
    <div className="flex min-h-[120px] flex-1 flex-col justify-between font-normal">
      <div className="space-y-1">
        <p className="font-semibold text-lg leading-tight">{server.displayName}</p>
        {server.description && <p className="text-muted-foreground text-sm">{server.description}</p>}
      </div>

      {toolNames.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">Tools ({toolNames.length}):</p>
          <div className="flex flex-wrap gap-2">
            {visibleTools.map((toolName) => (
              <span
                className="inline-flex items-center rounded-md bg-secondary/5 px-2 py-1 font-medium text-secondary text-xs"
                key={toolName}
              >
                {toolName}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-secondary/5 px-2 py-1 font-medium text-secondary text-xs">
                +{remainingCount} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (!showCheckbox) {
    return <div className={cn('flex rounded-lg border bg-card p-4', isSelected && 'border-secondary')}>{content}</div>;
  }

  return (
    <Label
      className={cn(
        'relative flex cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50',
        isSelected && 'border-secondary'
      )}
      htmlFor={`mcp-server-${idPrefix}-${server.id}`}
    >
      <Checkbox
        checked={isSelected}
        className="absolute top-4 right-4 shrink-0"
        id={`mcp-server-${idPrefix}-${server.id}`}
        onCheckedChange={onToggle}
      />
      <div className="pr-8">{content}</div>
    </Label>
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
      // Use the tools from the server's tools map (available without API call)
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
    <div className="space-y-3">
      <p className="font-semibold text-base">All Available Tools ({allTools.length})</p>
      <div className="flex flex-wrap gap-2">
        {allTools.map((toolName) => (
          <span
            className="inline-flex items-center rounded-md bg-secondary/5 px-2 py-1 font-medium text-secondary text-xs"
            key={toolName}
          >
            {toolName}
          </span>
        ))}
      </div>
    </div>
  );
};
