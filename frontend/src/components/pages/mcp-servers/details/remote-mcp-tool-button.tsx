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

import { Button } from 'components/redpanda-ui/components/button';
import { Text } from 'components/redpanda-ui/components/typography';
import { RedpandaConnectComponentTypeBadge } from 'components/ui/redpanda-connect-component-type-badge';
import { Trash2 } from 'lucide-react';
import type { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';

interface RemoteMCPToolButtonProps {
  id: string;
  name: string;
  description: string;
  componentType: MCPServer_Tool_ComponentType;
  isSelected: boolean;
  isEditing?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}

export const RemoteMCPToolButton = ({
  id,
  name,
  description,
  componentType,
  isSelected,
  isEditing = false,
  onClick,
  onRemove,
}: RemoteMCPToolButtonProps) => {
  return (
    <button
      aria-pressed={isSelected}
      className={`flex flex-col p-4 rounded-lg border transition-all hover:shadow-md cursor-pointer text-left w-full ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
          : 'bg-card hover:bg-gray-50 dark:hover:bg-secondary border-border'
      }`}
      key={id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      type="button"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <RedpandaConnectComponentTypeBadge componentType={componentType} />
          <Text as="span" className="text-sm truncate" title={name || 'Unnamed Tool'}>
            {name || 'Unnamed Tool'}
          </Text>
        </div>
        {isEditing && onRemove && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            size="sm"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex-1">
        <Text className="text-xs line-clamp-2" title={description} variant="muted">
          {description}
        </Text>
      </div>
    </button>
  );
};
