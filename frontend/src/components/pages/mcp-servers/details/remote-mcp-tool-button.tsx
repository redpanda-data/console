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
import { RedpandaConnectComponentTypeBadge } from 'components/ui/connect/redpanda-connect-component-type-badge';
import { AlertCircle, Trash2 } from 'lucide-react';
import type { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1/mcp_pb';

type RemoteMCPToolButtonProps = {
  id: string;
  name: string;
  description: string;
  componentType: MCPServer_Tool_ComponentType;
  isSelected: boolean;
  isEditing?: boolean;
  hasLintIssues?: boolean;
  onClick: () => void;
  onRemove?: () => void;
};

export const RemoteMCPToolButton = ({
  id,
  name,
  description,
  componentType,
  isSelected,
  isEditing = false,
  hasLintIssues = false,
  onClick,
  onRemove,
}: RemoteMCPToolButtonProps) => {
  const getButtonClassName = () => {
    if (hasLintIssues) {
      return 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30';
    }
    if (isSelected) {
      return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30';
    }
    return 'border-border bg-card hover:bg-gray-50 dark:hover:bg-secondary';
  };

  return (
    <button
      aria-pressed={isSelected}
      className={`flex w-full cursor-pointer flex-col rounded-lg border p-4 text-left transition-all hover:shadow-md ${getButtonClassName()}`}
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
      <div className="mb-1 flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <RedpandaConnectComponentTypeBadge componentType={componentType} />
          <Text as="span" className="truncate text-sm" title={name || 'Unnamed Tool'}>
            {name || 'Unnamed Tool'}
          </Text>
          {hasLintIssues && (
            <span title="Has linting issues">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
            </span>
          )}
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
        <Text className="line-clamp-2 text-xs" title={description} variant="muted">
          {description}
        </Text>
      </div>
    </button>
  );
};
