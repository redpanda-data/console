import { ChevronDown, ChevronRight } from 'lucide-react';
import { type MCPServer, MCPServerType } from 'protogen/redpanda/api/adp/v1alpha1/mcp_server_pb';
import type { HTMLAttributes } from 'react';
import { useMemo, useState } from 'react';
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
  const handleToggle = (serverName: string) => {
    const newValue = value.includes(serverName) ? value.filter((n) => n !== serverName) : [...value, serverName];
    onValueChange?.(newValue);
  };

  return (
    <div className={cn('w-full space-y-3', className)} data-testid={testId} {...props}>
      <div className="divide-y rounded-md border">
        {servers.map((server) => {
          const isSelected = value.includes(server.name);
          return (
            <MCPServerRow
              idPrefix={idPrefix}
              isSelected={isSelected}
              key={server.name}
              onToggle={() => handleToggle(server.name)}
              server={server}
              showCheckbox={showCheckbox}
            />
          );
        })}
      </div>

      <AllAvailableTools selectedServerNames={value} servers={servers} />
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
  const tools = server.tools ?? [];
  const hasTools = tools.length > 0;

  const MAX_VISIBLE_TOOLS = 6;
  const visibleTools = tools.slice(0, MAX_VISIBLE_TOOLS);
  const remainingCount = tools.length - MAX_VISIBLE_TOOLS;

  const typeLabel = server.type === MCPServerType.MCP_SERVER_TYPE_MANAGED ? 'Managed' : 'Remote';

  const rowContent = (
    <div className="flex flex-1 items-center gap-3">
      {hasTools ? (
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
      ) : (
        <div className="w-5 shrink-0" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate font-medium', !server.enabled && 'text-muted-foreground')}>{server.name}</span>
        {server.description && <span className="truncate text-muted-foreground text-xs">{server.description}</span>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Badge className="text-xs" variant="outline">
          {typeLabel}
        </Badge>
        {hasTools ? (
          <Badge className="text-xs" variant="secondary">
            {pluralizeWithNumber(tools.length, 'tool')}
          </Badge>
        ) : (
          <Badge className="text-xs" variant="secondary">
            Tools discovered on first use
          </Badge>
        )}
        {!server.enabled && (
          <Badge className="text-xs" variant="destructive">
            Disabled
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
            id={`mcp-server-${idPrefix}-${server.name}`}
            onCheckedChange={onToggle}
          />
        )}
        {showCheckbox ? (
          <Label className="flex flex-1 cursor-pointer items-center" htmlFor={`mcp-server-${idPrefix}-${server.name}`}>
            {rowContent}
          </Label>
        ) : (
          rowContent
        )}
      </div>

      {isExpanded && hasTools && (
        <div className="border-t bg-muted/30 px-3 py-2 pl-11">
          <div className="flex flex-wrap gap-1.5">
            {visibleTools.map((tool) => (
              <span
                className="inline-flex items-center rounded bg-secondary/10 px-1.5 py-0.5 font-medium text-secondary text-xs"
                key={tool.name}
              >
                {tool.name}
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
  selectedServerNames: string[];
};

const AllAvailableTools = ({ servers, selectedServerNames }: AllAvailableToolsProps) => {
  const selectedServers = useMemo(
    () => servers.filter((server) => selectedServerNames.includes(server.name)),
    [servers, selectedServerNames]
  );

  const allTools = useMemo(() => {
    const toolsSet = new Set<string>();
    for (const server of selectedServers) {
      for (const tool of server.tools ?? []) {
        toolsSet.add(tool.name);
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
