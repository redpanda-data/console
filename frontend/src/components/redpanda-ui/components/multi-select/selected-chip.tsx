'use client';

// Copyright 2026 Redpanda Data, Inc.

import { XIcon } from 'lucide-react';
import type React from 'react';
import { Button } from '../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';

interface SelectedChipProps {
  content: React.ReactNode;
  disabled: boolean;
  itemValue: string;
  label: string;
  onRemove: React.MouseEventHandler<HTMLButtonElement>;
  testId?: string | undefined;
  truncated: boolean;
}

export function SelectedChip({ content, disabled, itemValue, label, onRemove, testId, truncated }: SelectedChipProps) {
  const remove = (
    <Button
      aria-label={`Remove ${label}`}
      data-multi-select-remove={itemValue}
      disabled={disabled}
      onClick={onRemove}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <XIcon aria-hidden="true" />
    </Button>
  );
  return (
    <span
      className="inline-flex min-h-7 max-w-full min-w-0 items-center gap-1 rounded-md bg-surface-subtle py-0.5 pl-2 text-body font-medium text-strong"
      data-testid={testId}
    >
      <span className="min-w-0 [overflow-wrap:anywhere] whitespace-normal">{content}</span>
      {truncated ? (
        <Tooltip>
          <TooltipTrigger render={remove} />
          <TooltipContent align="start" side="bottom">
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        remove
      )}
    </span>
  );
}
