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

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'components/redpanda-ui/components/command';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { PlusIcon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useEffect, useMemo, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useListTopicsQuery } from 'react-query/api/topic';
import { useListUsersQuery } from 'react-query/api/user';

import { getContextualVariableSyntax, getSecretSyntax, REDPANDA_CONTEXTUAL_VARIABLES } from '../types/constants';
import { extractAllTopics } from '../utils/yaml';

type FilterValue = 'all' | 'variables' | 'secrets' | 'topics' | 'users';

type PipelineCommandMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editorInstance: editor.IStandaloneCodeEditor | null;
  onCreateSecret: () => void;
  onCreateUser?: () => void;
  onCreateTopic?: () => void;
  initialSearch?: string;
  yamlContent?: string;
};

function insertAtCursor(editorInstance: editor.IStandaloneCodeEditor, text: string) {
  const position = editorInstance.getPosition();
  if (!position) {
    return;
  }
  editorInstance.executeEdits('command-menu-insert', [
    {
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text,
    },
  ]);
  editorInstance.focus();
}

export const PipelineCommandMenu = ({
  open,
  onOpenChange,
  editorInstance,
  onCreateSecret,
  onCreateUser,
  onCreateTopic,
  initialSearch = '',
  yamlContent = '',
}: PipelineCommandMenuProps) => {
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');

  useEffect(() => {
    if (open) {
      setActiveFilter('all');
    }
  }, [open]);

  const { data: secretsResponse } = useListSecretsQuery({});
  const secrets = useMemo(
    () => (secretsResponse?.secrets ? secretsResponse.secrets.map((s) => s?.id || '').filter(Boolean) : []),
    [secretsResponse]
  );

  const { data: topicsResponse } = useListTopicsQuery({ pageSize: 500 });
  const clusterTopics = useMemo(
    () => (topicsResponse?.topics ? topicsResponse.topics.map((t) => t.name).filter(Boolean) : []),
    [topicsResponse]
  );

  // Merge cluster topics with topics referenced in YAML
  const yamlTopics = useMemo(() => extractAllTopics(yamlContent), [yamlContent]);
  const allTopics = useMemo(() => {
    const merged = new Set([...clusterTopics, ...yamlTopics]);
    return [...merged].sort();
  }, [clusterTopics, yamlTopics]);

  const { data: usersResponse } = useListUsersQuery(undefined, { enabled: open });
  const users = useMemo(
    () => (usersResponse?.users ? usersResponse.users.map((u) => u.name || '').filter(Boolean) : []),
    [usersResponse]
  );

  const contextualVariables = useMemo(() => Object.values(REDPANDA_CONTEXTUAL_VARIABLES), []);

  const handleSelect = (text: string) => {
    if (editorInstance) {
      insertAtCursor(editorInstance, text);
    }
    onOpenChange(false);
  };

  const handleCreate = (callback?: () => void) => {
    if (callback) {
      onOpenChange(false);
      callback();
    }
  };

  const show = (section: FilterValue) => activeFilter === 'all' || activeFilter === section;

  // Show separator between two sections only when both are visible
  const showSep = (a: FilterValue, b: FilterValue) => show(a) && show(b);

  return (
    <CommandDialog
      description="Insert contextual variables, secrets, topics, and users"
      onOpenChange={onOpenChange}
      open={open}
      title="Command Menu"
    >
      <CommandInput defaultValue={initialSearch} placeholder="Search variables, secrets, topics, users..." />
      <div className="border-b px-2 py-1.5">
        <ToggleGroup
          attached={false}
          onValueChange={(v: string) => {
            if (v) {
              setActiveFilter(v as FilterValue);
            }
          }}
          size="sm"
          type="single"
          value={activeFilter}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="variables">Variables</ToggleGroupItem>
          <ToggleGroupItem value="secrets">Secrets</ToggleGroupItem>
          <ToggleGroupItem value="topics">Topics</ToggleGroupItem>
          <ToggleGroupItem value="users">Users</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <CommandList className="pb-2">
        <CommandEmpty>No results found.</CommandEmpty>
        {show('variables') && (
          <CommandGroup heading="Contextual Variables">
            {contextualVariables.map((v) => (
              <CommandItem key={v.name} onSelect={() => handleSelect(getContextualVariableSyntax(v.name))}>
                <InlineCode>{getContextualVariableSyntax(v.name)}</InlineCode>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {showSep('variables', 'secrets') && <CommandSeparator />}
        {show('secrets') && (
          <CommandGroup heading="Secrets">
            {secrets.map((name) => (
              <CommandItem key={name} onSelect={() => handleSelect(getSecretSyntax(name))}>
                <InlineCode>{getSecretSyntax(name)}</InlineCode>
              </CommandItem>
            ))}
            <CommandItem className="justify-center text-center" onSelect={() => handleCreate(onCreateSecret)}>
              Create new secret
              <PlusIcon />
            </CommandItem>
          </CommandGroup>
        )}
        {showSep('secrets', 'topics') && <CommandSeparator />}
        {show('topics') && (
          <CommandGroup heading="Topics">
            {allTopics.map((name) => (
              <CommandItem key={name} onSelect={() => handleSelect(name)}>
                {name}
              </CommandItem>
            ))}
            {onCreateTopic ? (
              <CommandItem className="justify-center text-center" onSelect={() => handleCreate(onCreateTopic)}>
                <PlusIcon />
                Create new topic
              </CommandItem>
            ) : null}
          </CommandGroup>
        )}
        {showSep('topics', 'users') && <CommandSeparator />}
        {show('users') && (
          <CommandGroup heading="Users">
            {users.map((name) => (
              <CommandItem key={name} onSelect={() => handleSelect(name)}>
                {name}
              </CommandItem>
            ))}
            {onCreateUser ? (
              <CommandItem className="justify-center text-center" onSelect={() => handleCreate(onCreateUser)}>
                <PlusIcon />
                Create new user
              </CommandItem>
            ) : null}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
};
