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
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'components/redpanda-ui/components/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { PlusIcon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useListTopicsQuery } from 'react-query/api/topic';
import { useListUsersQuery } from 'react-query/api/user';
import { toast } from 'sonner';

import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { getContextualVariableSyntax, getSecretSyntax, REDPANDA_CONTEXTUAL_VARIABLES } from '../types/constants';
import type { AddTopicFormData, BaseStepRef, UserStepRef } from '../types/wizard';
import { extractAllTopics } from '../utils/yaml';

type FilterValue = 'all' | 'variables' | 'secrets' | 'topics' | 'users';

type PipelineCommandMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editorInstance: editor.IStandaloneCodeEditor | null;
  hideInternal?: boolean;
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
  // Move cursor to end of the line where text was inserted
  const model = editorInstance.getModel();
  if (model) {
    const endColumn = model.getLineMaxColumn(position.lineNumber);
    editorInstance.setPosition({ lineNumber: position.lineNumber, column: endColumn });
  }
}

function replaceSecretInEditor(editorInstance: editor.IStandaloneCodeEditor | null, oldName: string, newName: string) {
  if (!editorInstance) {
    return;
  }
  const model = editorInstance.getModel();
  if (!model) {
    return;
  }
  const content = model.getValue();
  const updated = content.replaceAll(`\${secrets.${oldName}}`, `\${secrets.${newName}}`);
  if (content !== updated) {
    model.setValue(updated);
  }
}

export const PipelineCommandMenu = ({
  open,
  onOpenChange,
  editorInstance,
  hideInternal = true,
  yamlContent = '',
}: PipelineCommandMenuProps) => {
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [pendingSearch, setPendingSearch] = useState('');
  const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);
  const [isTopicDialogOpen, setIsTopicDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  // Reset filter when dialog opens (adjust state during render, no useEffect needed)
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setActiveFilter('all');
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  // Secrets: query + missing-secret detection for AddSecretsDialog
  const { data: secretsResponse } = useListSecretsQuery({});
  const secrets = useMemo(
    () => (secretsResponse?.secrets ? secretsResponse.secrets.map((s) => s?.id || '').filter(Boolean) : []),
    [secretsResponse]
  );
  const missingSecrets = useMemo(() => {
    if (!yamlContent) {
      return [];
    }
    const references = extractSecretReferences(yamlContent);
    const referenced = getUniqueSecretNames(references);
    const existingSet = new Set(secrets);
    return referenced.filter((name) => !existingSet.has(name));
  }, [yamlContent, secrets]);

  // Cap at 500 — the command menu is a quick-pick, not a full topic browser
  const { data: topicsResponse } = useListTopicsQuery({ pageSize: 500 });
  const clusterTopics = useMemo(
    () =>
      topicsResponse?.topics
        ? topicsResponse.topics
            .map((t) => t.name)
            .filter(Boolean)
            .filter((name) => !(hideInternal && name.startsWith('__')))
        : [],
    [topicsResponse, hideInternal]
  );

  // Merge cluster topics with topics referenced in YAML
  const yamlTopics = useMemo(() => extractAllTopics(yamlContent), [yamlContent]);
  const allTopics = useMemo(() => {
    const merged = new Set([...clusterTopics, ...yamlTopics]);
    return [...merged].sort();
  }, [clusterTopics, yamlTopics]);

  const { data: usersResponse } = useListUsersQuery(undefined, { enabled: open });
  const users = useMemo(
    () =>
      usersResponse?.users
        ? usersResponse.users
            .map((u) => u.name || '')
            .filter(Boolean)
            .filter((name) => !(hideInternal && name.startsWith('__')))
        : [],
    [usersResponse, hideInternal]
  );

  const contextualVariables = useMemo(() => Object.values(REDPANDA_CONTEXTUAL_VARIABLES), []);

  const handleSelect = (text: string) => {
    if (editorInstance) {
      insertAtCursor(editorInstance, text);
    }
    handleOpenChange(false);
  };

  const openSubDialog = (setOpen: (v: boolean) => void) => {
    onOpenChange(false);
    setPendingSearch('');
    setOpen(true);
  };

  const handleUpdateEditorContent = useCallback(
    (oldName: string, newName: string) => {
      replaceSecretInEditor(editorInstance, oldName, newName);
    },
    [editorInstance]
  );

  const handleSecretsCreated = useCallback(
    (secretNames?: string[]) => {
      setIsSecretsDialogOpen(false);
      if (secretNames && secretNames.length > 0) {
        setPendingSearch(secretNames[0]);
        onOpenChange(true);
      }
    },
    [onOpenChange]
  );

  const handleCreateTopic = useCallback(async () => {
    const result = await topicStepRef.current?.triggerSubmit();
    if (result?.success) {
      if (result.message) {
        toast.success(result.message);
      }
      setIsTopicDialogOpen(false);
      if (result.data?.topicName) {
        setPendingSearch(result.data.topicName);
        onOpenChange(true);
      }
    } else if (result?.error) {
      toast.error(result.error);
    }
  }, [onOpenChange]);

  const handleCreateUser = useCallback(async () => {
    const result = await userStepRef.current?.triggerSubmit();
    if (result?.success) {
      setIsUserDialogOpen(false);
      const data = result.data;
      const name = data && 'username' in data ? data.username : '';
      if (name) {
        setPendingSearch(name);
        onOpenChange(true);
      }
    }
  }, [onOpenChange]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setPendingSearch('');
      // Re-focus editor after dialog close animation
      requestAnimationFrame(() => {
        editorInstance?.focus();
      });
    }
  };

  const show = (section: FilterValue) => activeFilter === 'all' || activeFilter === section;

  // Show separator between two sections only when both are visible
  const showSep = (a: FilterValue, b: FilterValue) => show(a) && show(b);

  return (
    <>
      <CommandDialog
        description="Insert contextual variables, secrets, topics, and users"
        onOpenChange={handleOpenChange}
        open={open}
        title="Command Menu"
      >
        <CommandInput defaultValue={pendingSearch} placeholder="Search variables, secrets, topics, users..." />
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
              <CommandItem
                className="justify-center text-center"
                onSelect={() => openSubDialog(setIsSecretsDialogOpen)}
              >
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
              <CommandItem className="justify-center text-center" onSelect={() => openSubDialog(setIsTopicDialogOpen)}>
                <PlusIcon />
                Create new topic
              </CommandItem>
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
              <CommandItem className="justify-center text-center" onSelect={() => openSubDialog(setIsUserDialogOpen)}>
                <PlusIcon />
                Create new user
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      <AddSecretsDialog
        existingSecrets={secrets}
        isOpen={isSecretsDialogOpen}
        missingSecrets={missingSecrets}
        onClose={() => setIsSecretsDialogOpen(false)}
        onSecretsCreated={handleSecretsCreated}
        onUpdateEditorContent={handleUpdateEditorContent}
      />

      <Dialog onOpenChange={setIsTopicDialogOpen} open={isTopicDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Create a topic</DialogTitle>
          </DialogHeader>
          <AddTopicStep hideTitle ref={topicStepRef} selectionMode="new" />
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={() => setIsTopicDialogOpen(false)} variant="secondary-ghost">
              Cancel
            </Button>
            <Button onClick={handleCreateTopic} variant="primary">
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIsUserDialogOpen} open={isUserDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Create a user</DialogTitle>
          </DialogHeader>
          <AddUserStep hideTitle ref={userStepRef} selectionMode="new" />
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={() => setIsUserDialogOpen(false)} variant="secondary-ghost">
              Cancel
            </Button>
            <Button onClick={handleCreateUser} variant="primary">
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
