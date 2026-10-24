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

import { PlusIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'components/redpanda-ui/components/command';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useListTopicsQuery } from 'react-query/api/topic';
import { useListUsersQuery } from 'react-query/api/user';
import { toast } from 'sonner';

import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { getContextualVariableSyntax, getSecretSyntax, REDPANDA_CONTEXTUAL_VARIABLES } from '../types/constants';
import type {
  AddTopicFormData,
  BaseStepRef,
  StepSubmissionResult,
  UserStepRef,
  UserStepSubmissionData,
  UserStepSubmissionResult,
} from '../types/wizard';
import { extractAllTopics } from '../utils/yaml';

/**
 * Compute the pixel position of a line/column in the Monaco editor using
 * `getScrolledVisiblePosition`. Returns a fixed-position style for the popover.
 * Re-syncs on editor scroll and window resize.
 * (Rule 4: external system sync — Monaco coordinate API)
 */
const HIDDEN_STYLE: React.CSSProperties = { position: 'fixed', visibility: 'hidden' };

function useAnchorPosition(
  editorInstance: editor.IStandaloneCodeEditor | null,
  slashPosition: { lineNumber: number; column: number } | null,
  open: boolean
) {
  const [style, setStyle] = useState<React.CSSProperties>(HIDDEN_STYLE);
  const isActive = !!(editorInstance && slashPosition && open);

  useEffect(() => {
    if (!(editorInstance && slashPosition && open)) {
      return;
    }

    const updatePosition = () => {
      const coords = editorInstance.getScrolledVisiblePosition(slashPosition);
      const editorDom = editorInstance.getDomNode();
      if (!(coords && editorDom)) {
        setStyle((prev) => ({ ...prev, visibility: 'hidden' }));
        return;
      }
      const editorRect = editorDom.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: editorRect.top + coords.top + coords.height,
        left: editorRect.left + coords.left,
        zIndex: 50,
        visibility: 'visible',
      });
    };

    updatePosition();

    const scrollDisposable = editorInstance.onDidScrollChange(updatePosition);
    window.addEventListener('resize', updatePosition, { passive: true });

    return () => {
      scrollDisposable.dispose();
      window.removeEventListener('resize', updatePosition);
    };
  }, [editorInstance, slashPosition, open]);

  if (!isActive) {
    return HIDDEN_STYLE;
  }
  return style;
}

/**
 * Close the popover when the user clicks outside of it.
 * Returns a ref to attach to the popover container.
 * (Rule 4: external system sync — document click listener)
 */
function useClickOutside(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onClose]);

  return containerRef;
}

type FilterValue = 'all' | 'variables' | 'secrets' | 'topics' | 'users';

/** The create flow the menu hands off to; it closes itself first. */
type SubDialog = 'secrets' | 'topic' | 'user';

const CONTEXTUAL_VARIABLES = Object.values(REDPANDA_CONTEXTUAL_VARIABLES);

type SharedProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editorInstance: editor.IStandaloneCodeEditor | null;
  hideInternal?: boolean;
  yamlContent?: string;
  initialFilter?: FilterValue;
};

type DialogVariantProps = SharedProps & {
  variant?: 'dialog';
};

type PopoverVariantProps = SharedProps & {
  variant: 'popover';
  /** Line/column where `/` was typed — used for popover positioning */
  slashPosition: { lineNumber: number; column: number } | null;
  /** Called on item selection — replaces `/` text in editor */
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

function CommandGroupHeading({ children, separator }: { children: React.ReactNode; separator?: boolean }) {
  return (
    <>
      {separator ? <Separator /> : null}
      <h5 className="pt-3 pb-3 pl-2 text-body-sm font-semibold tracking-caption-wide text-muted-foreground uppercase">
        {children}
      </h5>
    </>
  );
}

type CommandMenuContentProps = {
  contextualVariables: Array<{ name: string }>;
  secrets: string[];
  allTopics: string[];
  users: string[];
  showCategoryFilter: boolean;
  activeFilter: FilterValue;
  onFilterChange: (filter: FilterValue) => void;
  onSelect: (text: string) => void;
  onOpenSubDialog: (dialog: SubDialog) => void;
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
}: CommandMenuContentProps) {
  const show = (section: FilterValue) => activeFilter === 'all' || activeFilter === section;
  // An empty category keeps its create button below but gets no heading.
  const showVariables = show('variables');
  const showSecrets = show('secrets') && secrets.length > 0;
  const showTopics = show('topics') && allTopics.length > 0;
  const showUsers = show('users') && users.length > 0;

  return (
    <>
      {showCategoryFilter ? (
        <div className="border-b !border-input bg-surface-recess px-2 py-1.5">
          <ToggleGroup
            attached={false}
            onValueChange={([v]) => {
              if (v) {
                onFilterChange(v as FilterValue);
              }
            }}
            value={[activeFilter]}
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="variables">Variables</ToggleGroupItem>
            <ToggleGroupItem value="secrets">Secrets</ToggleGroupItem>
            <ToggleGroupItem value="topics">Topics</ToggleGroupItem>
            <ToggleGroupItem value="users">Users</ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {showVariables ? (
          <CommandGroup>
            <CommandGroupHeading>Contextual variables</CommandGroupHeading>
            {contextualVariables.map((v) => (
              <CommandItem key={v.name} onSelect={() => onSelect(getContextualVariableSyntax(v.name))}>
                <InlineCode>{getContextualVariableSyntax(v.name)}</InlineCode>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {showSecrets ? (
          <CommandGroup>
            <CommandGroupHeading separator={showVariables}>Secrets</CommandGroupHeading>
            {secrets.map((name) => (
              <CommandItem key={name} onSelect={() => onSelect(getSecretSyntax(name))}>
                <InlineCode>secrets.{name}</InlineCode>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {showTopics ? (
          <CommandGroup>
            <CommandGroupHeading separator={showVariables || showSecrets}>Topics</CommandGroupHeading>
            {allTopics.map((name) => (
              <CommandItem key={name} onSelect={() => onSelect(name)}>
                {name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {showUsers ? (
          <CommandGroup>
            <CommandGroupHeading separator={showVariables || showSecrets || showTopics}>Users</CommandGroupHeading>
            {users.map((name) => (
              <CommandItem key={name} onSelect={() => onSelect(name)}>
                {name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      {(show('secrets') || show('topics') || show('users')) && (
        <div className="flex flex-wrap gap-1 border-t !border-input bg-surface-recess px-2 py-1">
          {show('secrets') && (
            <Button icon={<PlusIcon />} onClick={() => onOpenSubDialog('secrets')} variant="ghost">
              Create secret
            </Button>
          )}
          {show('topics') && (
            <Button icon={<PlusIcon />} onClick={() => onOpenSubDialog('topic')} variant="ghost">
              Create topic
            </Button>
          )}
          {show('users') && (
            <Button icon={<PlusIcon />} onClick={() => onOpenSubDialog('user')} variant="ghost">
              Create user
            </Button>
          )}
        </div>
      )}
    </>
  );
}

// On mount, steal focus from Monaco into the cmdk input, deferred past Monaco's keystroke processing.
function useCmdkInputAutoFocus(clickOutsideRef: ReturnType<typeof useClickOutside>) {
  const abortFocusRef = useRef(false);
  return useCallback(
    (node: HTMLDivElement | null) => {
      clickOutsideRef.current = node;
      if (!node) {
        abortFocusRef.current = true;
        return;
      }
      abortFocusRef.current = false;

      // setTimeout(0) clears the keystroke handler task, rAF defers past layout/paint.
      setTimeout(() => {
        if (abortFocusRef.current) {
          return;
        }
        requestAnimationFrame(() => {
          if (abortFocusRef.current) {
            return;
          }
          const input = node.querySelector('input[cmdk-input]') as HTMLInputElement | null;
          if (input && document.activeElement !== input) {
            input.focus();
          }
        });
      }, 0);
    },
    [clickOutsideRef]
  );
}

// Reset filter when the menu opens (adjust state during render, no useEffect needed)
function useFilterResetOnOpen(open: boolean, initialFilter: FilterValue | undefined) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setActiveFilter(initialFilter ?? 'all');
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }
  return [activeFilter, setActiveFilter] as const;
}

function useCommandMenuSecrets(open: boolean, yamlContent: string) {
  const { data: secretsResponse } = useListSecretsQuery({}, { enabled: open });
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
  return { secrets, missingSecrets };
}

function useCommandMenuTopics(open: boolean, yamlContent: string, hideInternal: boolean) {
  // Cap at 500 — the command menu is a quick-pick, not a full topic browser
  const { data: topicsResponse } = useListTopicsQuery({ pageSize: 500 }, { enabled: open });
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

  const yamlTopics = useMemo(() => extractAllTopics(yamlContent), [yamlContent]);
  return useMemo(() => {
    const merged = new Set([...clusterTopics, ...yamlTopics]);
    return [...merged].sort();
  }, [clusterTopics, yamlTopics]);
}

function useCommandMenuUsers(open: boolean, hideInternal: boolean) {
  const { data: usersResponse } = useListUsersQuery(undefined, { enabled: open });
  return useMemo(
    () =>
      usersResponse?.users
        ? usersResponse.users
            .map((u) => u.name || '')
            .filter(Boolean)
            .filter((name) => !(hideInternal && name.startsWith('__')))
        : [],
    [usersResponse, hideInternal]
  );
}

// Escape closes the popover; Tab picks the highlighted item, like Enter.
function handlePopoverKeyDown(e: React.KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const selected = (e.currentTarget as HTMLElement).querySelector('[cmdk-item][aria-selected="true"]');
    if (selected) {
      (selected as HTMLElement).click();
    }
  }
}

// Rendered outside Monaco's DOM via a portal for proper focus handling.
function PipelineCommandPopover({
  editorInstance,
  slashPosition,
  open,
  onOpenChange,
  children,
}: {
  editorInstance: editor.IStandaloneCodeEditor | null;
  slashPosition: { lineNumber: number; column: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  // Position the popover using Monaco's coordinate API (rendered outside Monaco's DOM)
  const anchorStyle = useAnchorPosition(editorInstance, slashPosition, open);
  const clickOutsideRef = useClickOutside(open, () => onOpenChange(false));
  const popoverRef = useCmdkInputAutoFocus(clickOutsideRef);

  return open
    ? createPortal(
        <div ref={popoverRef} style={anchorStyle}>
          <Command
            className="w-[340px]"
            loop
            onKeyDown={(e) => handlePopoverKeyDown(e, () => onOpenChange(false))}
            size="sm"
            variant="elevated"
            vimBindings={false}
          >
            <CommandInput placeholder="Filter..." />
            {children}
          </Command>
        </div>,
        document.body
      )
    : null;
}

function PipelineCommandDialog({
  editorInstance,
  open,
  onOpenChange,
  children,
}: {
  editorInstance: editor.IStandaloneCodeEditor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      requestAnimationFrame(() => {
        editorInstance?.focus();
      });
    }
  };

  return (
    <CommandDialog
      // Full width of the dialog, rather than the palette's fixed minimum.
      commandProps={{ size: 'full' }}
      description="Insert a contextual variable, secret, topic, or user"
      onOpenChange={handleOpenChange}
      open={open}
      title="Command Menu"
    >
      <CommandInput placeholder="Search variables, secrets, topics, users..." />
      {children}
    </CommandDialog>
  );
}

type CreateSubDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Inserts the created resource's name. */
  onCreated: (name: string) => void;
};

// The step reports its own copy: a success message, or the error to show.
function settleTopicCreation(
  result: StepSubmissionResult<AddTopicFormData>,
  close: () => void,
  onCreated: (name: string) => void
) {
  if (!result.success) {
    if (result.error) {
      toast.error(result.error);
    }
    return;
  }
  if (result.message) {
    toast.success(result.message);
  }
  close();
  if (result.data?.topicName) {
    onCreated(result.data.topicName);
  }
}

function CreateTopicDialog({ open, onOpenChange, onCreated }: CreateSubDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);

  const handleCreate = async () => {
    const ref = topicStepRef.current;
    if (!ref) {
      return;
    }
    setIsSubmitting(true);
    const result = await ref.triggerSubmit();
    settleTopicCreation(result, () => onOpenChange(false), onCreated);
    setIsSubmitting(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Create a topic</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <AddTopicStep hideTitle inline ref={topicStepRef} selectionMode="new" />
        </DialogBody>
        <DialogFooter>
          <Button disabled={isSubmitting} onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button disabled={isSubmitting} isLoading={isSubmitting} onClick={handleCreate} variant="primary">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const createdUsername = (data: UserStepSubmissionData | undefined) => (data && 'username' in data ? data.username : '');

function settleUserCreation(result: UserStepSubmissionResult, close: () => void, onCreated: (name: string) => void) {
  if (!result.success) {
    return;
  }
  close();
  const name = createdUsername(result.data);
  if (name) {
    onCreated(name);
  }
}

function CreateUserDialog({ open, onOpenChange, onCreated }: CreateSubDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const userStepRef = useRef<UserStepRef>(null);

  const handleCreate = async () => {
    const ref = userStepRef.current;
    if (!ref) {
      return;
    }
    setIsSubmitting(true);
    const result = await ref.triggerSubmit();
    settleUserCreation(result, () => onOpenChange(false), onCreated);
    setIsSubmitting(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Create a user</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <AddUserStep hideTitle inline ref={userStepRef} selectionMode="new" />
        </DialogBody>
        <DialogFooter>
          <Button disabled={isSubmitting} onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button className="min-w-[70px]" disabled={isSubmitting} onClick={handleCreate} variant="primary">
            {isSubmitting ? <Spinner /> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommandMenuSubDialogs({
  subDialog,
  onSubDialogChange,
  secrets,
  missingSecrets,
  editorInstance,
  onSelect,
}: {
  subDialog: SubDialog | null;
  onSubDialogChange: (dialog: SubDialog | null) => void;
  secrets: string[];
  missingSecrets: string[];
  editorInstance: editor.IStandaloneCodeEditor | null;
  onSelect: (text: string) => void;
}) {
  const close = () => onSubDialogChange(null);
  return (
    <>
      <AddSecretsDialog
        existingSecrets={secrets}
        isOpen={subDialog === 'secrets'}
        missingSecrets={missingSecrets}
        onClose={close}
        onSecretsCreated={(secretNames) => {
          close();
          if (secretNames && secretNames.length > 0) {
            onSelect(getSecretSyntax(secretNames[0]));
          }
        }}
        onUpdateEditorContent={(oldName, newName) => replaceSecretInEditor(editorInstance, oldName, newName)}
      />
      <CreateTopicDialog
        onCreated={onSelect}
        onOpenChange={(next) => onSubDialogChange(next ? 'topic' : null)}
        open={subDialog === 'topic'}
      />
      <CreateUserDialog
        onCreated={onSelect}
        onOpenChange={(next) => onSubDialogChange(next ? 'user' : null)}
        open={subDialog === 'user'}
      />
    </>
  );
}

export const PipelineCommandMenu = (props: PipelineCommandMenuProps) => {
  const { open, onOpenChange, editorInstance, hideInternal = true, yamlContent = '', initialFilter } = props;
  const isPopover = props.variant === 'popover';
  const [activeFilter, setActiveFilter] = useFilterResetOnOpen(open, initialFilter);
  const [subDialog, setSubDialog] = useState<SubDialog | null>(null);
  const { secrets, missingSecrets } = useCommandMenuSecrets(open, yamlContent);
  const allTopics = useCommandMenuTopics(open, yamlContent, hideInternal);
  const users = useCommandMenuUsers(open, hideInternal);

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

  const content = (
    <CommandMenuContent
      activeFilter={activeFilter}
      allTopics={allTopics}
      contextualVariables={CONTEXTUAL_VARIABLES}
      onFilterChange={setActiveFilter}
      onOpenSubDialog={(dialog) => {
        onOpenChange(false);
        setSubDialog(dialog);
      }}
      onSelect={handleSelect}
      secrets={secrets}
      showCategoryFilter={!isPopover}
      users={users}
    />
  );

  return (
    <>
      {isPopover ? (
        <PipelineCommandPopover
          editorInstance={editorInstance}
          onOpenChange={onOpenChange}
          open={open}
          slashPosition={props.slashPosition}
        >
          {content}
        </PipelineCommandPopover>
      ) : (
        <PipelineCommandDialog editorInstance={editorInstance} onOpenChange={onOpenChange} open={open}>
          {content}
        </PipelineCommandDialog>
      )}
      <CommandMenuSubDialogs
        editorInstance={editorInstance}
        missingSecrets={missingSecrets}
        onSelect={handleSelect}
        onSubDialogChange={setSubDialog}
        secrets={secrets}
        subDialog={subDialog}
      />
    </>
  );
};
