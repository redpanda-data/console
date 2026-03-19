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
  Command,
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
import { createPortal } from 'react-dom';
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

type SharedProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editorInstance: editor.IStandaloneCodeEditor | null;
  hideInternal?: boolean;
  yamlContent?: string;
};

type DialogVariantProps = SharedProps & {
  variant?: 'dialog';
};

type PopoverVariantProps = SharedProps & {
  variant: 'popover';
  /** DOM node from useSlashCommand to portal into (positioned by Monaco IContentWidget) */
  widgetDom: HTMLElement;
  /** Text typed after `/` — drives cmdk filtering */
  slashQuery: string;
  /** Ref to attach to the Command container for keyboard event forwarding */
  commandContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Called on item selection — replaces `/query` text in editor */
  onSlashSelect: (text: string) => void;
};

export type PipelineCommandMenuProps = DialogVariantProps | PopoverVariantProps;

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

// ── Shared content rendered by both variants ─────────────────────────

type CommandMenuContentProps = {
  contextualVariables: Array<{ name: string }>;
  secrets: string[];
  allTopics: string[];
  users: string[];
  showCategoryFilter: boolean;
  activeFilter: FilterValue;
  onFilterChange: (filter: FilterValue) => void;
  onSelect: (text: string) => void;
  onOpenSubDialog: (setOpen: (v: boolean) => void) => void;
  setIsSecretsDialogOpen: (v: boolean) => void;
  setIsTopicDialogOpen: (v: boolean) => void;
  setIsUserDialogOpen: (v: boolean) => void;
};

function CommandMenuContent({
  contextualVariables,
  secrets,
  allTopics,
  users,
  showCategoryFilter,
  activeFilter,
  onFilterChange,
  onSelect,
  onOpenSubDialog,
  setIsSecretsDialogOpen,
  setIsTopicDialogOpen,
  setIsUserDialogOpen,
}: CommandMenuContentProps) {
  const show = (section: FilterValue) => activeFilter === 'all' || activeFilter === section;
  const showSep = (a: FilterValue, b: FilterValue) => show(a) && show(b);

  return (
    <>
      {showCategoryFilter && (
        <div className="border-b px-2 py-1.5">
          <ToggleGroup
            attached={false}
            onValueChange={(v: string) => {
              if (v) {
                onFilterChange(v as FilterValue);
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
      )}
      <CommandList className="pb-2">
        <CommandEmpty>No results found.</CommandEmpty>
        {show('variables') && (
          <CommandGroup heading="Contextual Variables">
            {contextualVariables.map((v) => (
              <CommandItem key={v.name} onSelect={() => onSelect(getContextualVariableSyntax(v.name))}>
                <InlineCode>{getContextualVariableSyntax(v.name)}</InlineCode>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {showSep('variables', 'secrets') && <CommandSeparator />}
        {show('secrets') && (
          <CommandGroup heading="Secrets">
            {secrets.map((name) => (
              <CommandItem key={name} onSelect={() => onSelect(getSecretSyntax(name))}>
                <InlineCode>{getSecretSyntax(name)}</InlineCode>
              </CommandItem>
            ))}
            <CommandItem
              className="justify-center text-center"
              onSelect={() => onOpenSubDialog(setIsSecretsDialogOpen)}
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
              <CommandItem key={name} onSelect={() => onSelect(name)}>
                {name}
              </CommandItem>
            ))}
            <CommandItem className="justify-center text-center" onSelect={() => onOpenSubDialog(setIsTopicDialogOpen)}>
              <PlusIcon />
              Create new topic
            </CommandItem>
          </CommandGroup>
        )}
        {showSep('topics', 'users') && <CommandSeparator />}
        {show('users') && (
          <CommandGroup heading="Users">
            {users.map((name) => (
              <CommandItem key={name} onSelect={() => onSelect(name)}>
                {name}
              </CommandItem>
            ))}
            <CommandItem className="justify-center text-center" onSelect={() => onOpenSubDialog(setIsUserDialogOpen)}>
              <PlusIcon />
              Create new user
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────

export const PipelineCommandMenu = (props: PipelineCommandMenuProps) => {
  const { open, onOpenChange, editorInstance, hideInternal = true, yamlContent = '' } = props;
  const isPopover = props.variant === 'popover';

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

  const handleSelect = useCallback(
    (text: string) => {
      if (isPopover) {
        props.onSlashSelect(text);
      } else {
        if (editorInstance) {
          insertAtCursor(editorInstance, text);
        }
        onOpenChange(false);
        requestAnimationFrame(() => {
          editorInstance?.focus();
        });
      }
    },
    [isPopover, editorInstance, onOpenChange, props]
  );

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
        handleSelect(getSecretSyntax(secretNames[0]));
      }
    },
    [handleSelect]
  );

  const handleCreateTopic = useCallback(async () => {
    const result = await topicStepRef.current?.triggerSubmit();
    if (result?.success) {
      if (result.message) {
        toast.success(result.message);
      }
      setIsTopicDialogOpen(false);
      if (result.data?.topicName) {
        handleSelect(result.data.topicName);
      }
    } else if (result?.error) {
      toast.error(result.error);
    }
  }, [handleSelect]);

  const handleCreateUser = useCallback(async () => {
    const result = await userStepRef.current?.triggerSubmit();
    if (result?.success) {
      setIsUserDialogOpen(false);
      const data = result.data;
      const name = data && 'username' in data ? data.username : '';
      if (name) {
        handleSelect(name);
      }
    }
  }, [handleSelect]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setPendingSearch('');
      // Re-focus editor after dialog close animation
      requestAnimationFrame(() => {
        editorInstance?.focus();
      });
    }
  };

  const contentProps: CommandMenuContentProps = {
    contextualVariables,
    secrets,
    allTopics,
    users,
    showCategoryFilter: !isPopover,
    activeFilter,
    onFilterChange: setActiveFilter,
    onSelect: handleSelect,
    onOpenSubDialog: openSubDialog,
    setIsSecretsDialogOpen,
    setIsTopicDialogOpen,
    setIsUserDialogOpen,
  };

  // ── Sub-dialogs (shared by both variants) ──────────────────────────

  const subDialogs = (
    <>
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

  // ── Popover variant (rendered into Monaco content widget via portal) ──

  if (isPopover) {
    return (
      <>
        {open &&
          createPortal(
            <Command
              className="w-72 rounded-md border bg-background shadow-md"
              loop
              ref={props.commandContainerRef}
              size="sm"
              variant="elevated"
              vimBindings={false}
            >
              <CommandInput className="sr-only" tabIndex={-1} value={props.slashQuery} />
              <CommandMenuContent {...contentProps} />
            </Command>,
            props.widgetDom
          )}
        {subDialogs}
      </>
    );
  }

  // ── Dialog variant (existing Cmd+Shift+P behavior) ─────────────────

  return (
    <>
      <CommandDialog
        description="Insert contextual variables, secrets, topics, and users"
        onOpenChange={handleDialogOpenChange}
        open={open}
        title="Command Menu"
      >
        <CommandInput defaultValue={pendingSearch} placeholder="Search variables, secrets, topics, users..." />
        <CommandMenuContent {...contentProps} />
      </CommandDialog>
      {subDialogs}
    </>
  );
};
