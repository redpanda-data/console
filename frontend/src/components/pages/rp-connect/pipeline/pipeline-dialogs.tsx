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

import './pipeline-editor.css';

import { create } from '@bufbuild/protobuf';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { ComponentListSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useState } from 'react';
import { rpcnEditorAutosave } from 'state/rpcn-editor-autosave';
import { asyncEvent } from 'utils/async-event';
import { reportActionError, showToast } from 'utils/toast.utils';

import { PipelineCommandMenu } from './pipeline-command-menu';
import type { SaveIntent } from './save-actions';
import type { useDiagramDialogs, usePipelinePageModel, useUnsavedChangesGuard } from './use-pipeline-page-model';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { TemplateGalleryDialog } from '../template-gallery/template-gallery-dialog';
import type { ConnectComponentType } from '../types/schema';

function getConnectorDialogTitle(type: ConnectComponentType | 'resource' | null): string | undefined {
  if (type === 'input') {
    return 'Add an input';
  }
  if (type === 'output') {
    return 'Add an output';
  }
  return type ? `Add a ${type}` : undefined;
}

function getConnectorDialogPlaceholder(type: ConnectComponentType | 'resource' | null): string | undefined {
  return type ? `Search ${type}s...` : undefined;
}

type UnsavedChangesGuard = ReturnType<typeof useUnsavedChangesGuard>;

export type PipelinePageModel = ReturnType<typeof usePipelinePageModel>;

export function UnsavedChangesDialog({
  guard,
  autosaveTarget,
  flushAutosave,
  onSave,
}: {
  guard: UnsavedChangesGuard;
  autosaveTarget: string;
  flushAutosave: () => boolean;
  onSave: (intent?: SaveIntent) => Promise<boolean>;
}) {
  const { blocker, unsavedChanges } = guard;
  // After a failed draft save the browser buffer is offered beside it, so Discard is never the only exit.
  const [hasDraftEscapeFailed, setHasDraftEscapeFailed] = useState(false);
  const canSaveDraftAndLeave = unsavedChanges.escape === 'save-draft';
  useEffect(() => {
    if (blocker.status !== 'blocked') {
      setHasDraftEscapeFailed(false);
    }
  }, [blocker.status]);

  // Discard clears the recovery buffer too, or the next visit offers the edits back.
  const handleDiscardAndLeave = useCallback(() => {
    rpcnEditorAutosave.clear(autosaveTarget);
    blocker.proceed?.();
  }, [autosaveTarget, blocker]);

  // Flushed, not debounced: the pending write dies with the page.
  const handleLeaveAndKeepEdits = useCallback(() => {
    if (!flushAutosave()) {
      showToast({
        status: 'error',
        title: 'Your edits could not be kept in this browser. Save them, or discard them to leave.',
      });
      return;
    }
    blocker.proceed?.();
  }, [flushAutosave, blocker]);

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : blocker.reset?.())} open={blocker.status === 'blocked'}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave without saving your changes?</DialogTitle>
        </DialogHeader>
        <DialogBody>{unsavedChanges.body}</DialogBody>
        <DialogFooter>
          <Button onClick={handleDiscardAndLeave} testId="discard-and-leave" variant="ghost">
            Discard changes
          </Button>
          <Button onClick={() => blocker.reset?.()} variant="outline">
            Keep editing
          </Button>
          {canSaveDraftAndLeave ? (
            <Button
              onClick={asyncEvent(async () => {
                if (await onSave({ run: 'draft', skipNavigation: true })) {
                  blocker.proceed?.();
                  return;
                }
                setHasDraftEscapeFailed(true);
              }, reportActionError)}
              testId="save-draft-and-leave"
              variant={hasDraftEscapeFailed ? 'outline' : 'primary'}
            >
              Save draft
            </Button>
          ) : null}
          {canSaveDraftAndLeave && !hasDraftEscapeFailed ? null : (
            <ElementTooltip content="Your edits stay in this browser, and this editor offers them back next time">
              <Button onClick={handleLeaveAndKeepEdits} testId="leave-and-keep-edits" variant="primary">
                Leave for now
              </Button>
            </ElementTooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PipelineCommandMenus({ page }: { page: PipelinePageModel }) {
  const { editorInstance, commandMenuFilter, yamlContent } = page.editorState;
  const { setCommandMenuFilter } = page.editorState.actions;
  const { slashCommand } = page.actions;
  return (
    <>
      <PipelineCommandMenu
        editorInstance={editorInstance}
        initialFilter={commandMenuFilter ?? undefined}
        onOpenChange={(open) => {
          if (!open) {
            setCommandMenuFilter(null);
          }
        }}
        open={commandMenuFilter !== null}
        yamlContent={yamlContent}
      />

      {page.config.isSlashMenuEnabled ? (
        <PipelineCommandMenu
          editorInstance={editorInstance}
          onOpenChange={(open) => {
            if (!open) {
              slashCommand.close();
            }
          }}
          onSlashSelect={slashCommand.handleSlashSelect}
          open={slashCommand.isOpen}
          slashPosition={slashCommand.slashPosition}
          variant="popover"
          yamlContent={yamlContent}
        />
      ) : null}
    </>
  );
}

type DiagramDialogs = ReturnType<typeof useDiagramDialogs>;

export function AddTopicDialog({ dialogs }: { dialogs: DiagramDialogs }) {
  const { topicDialog, topicStepRef } = dialogs;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          topicDialog.close();
        }
      }}
      open={topicDialog.isOpen}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add topic</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <AddTopicStep hideTitle inline ref={topicStepRef} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={topicDialog.close} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={topicDialog.isSubmitting}
            icon={topicDialog.isSubmitting ? <Spinner /> : undefined}
            onClick={asyncEvent(topicDialog.submit, reportActionError)}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddUserDialog({
  dialogs,
  hasServiceAccount,
  pipelineName,
}: {
  dialogs: DiagramDialogs;
  hasServiceAccount: boolean;
  pipelineName: string | undefined;
}) {
  const { userDialog, userStepRef, connectorTopics, connectorConsumerGroup } = dialogs;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          userDialog.close();
        }
      }}
      open={userDialog.isOpen}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {connectorTopics === undefined && (
            <Alert variant="warning">
              <AlertTitle>No topic yet</AlertTitle>
              <AlertDescription>
                This connector has no topic yet, so the user won't be granted access to one. Add a topic first, or grant
                access later in the Security settings.
              </AlertDescription>
            </Alert>
          )}
          {connectorTopics && connectorTopics.length > 1 && (
            <Alert variant="warning">
              <AlertTitle>Multiple topics configured</AlertTitle>
              <AlertDescription>
                This connector uses multiple topics ({connectorTopics.join(', ')}). You will need to configure topic
                ACLs for this user manually in the Security settings.
              </AlertDescription>
            </Alert>
          )}
          <AddUserStep
            defaultConsumerGroup={connectorConsumerGroup}
            hasServiceAccount={hasServiceAccount}
            hideTitle
            inline
            pipelineName={pipelineName}
            ref={userStepRef}
            showConsumerGroupFields={userDialog.target?.section === 'input'}
            topicAccess={userDialog.target?.section === 'input' ? 'read' : 'write'}
            topicName={connectorTopics?.length === 1 ? connectorTopics[0] : undefined}
          />
        </DialogBody>
        <DialogFooter>
          <Button onClick={userDialog.close} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={userDialog.isSubmitting}
            icon={userDialog.isSubmitting ? <Spinner /> : undefined}
            onClick={asyncEvent(userDialog.submit, reportActionError)}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PipelineConnectorDialogs({ page }: { page: PipelinePageModel }) {
  const { config, editorState, form } = page;
  const { addConnectorType } = editorState;
  const { setAddConnectorType, setYamlContent, setIsTemplateDialogOpen } = editorState.actions;
  return (
    <>
      <AddConnectorDialog
        components={page.server.componentList ?? create(ComponentListSchema)}
        connectorType={
          addConnectorType === 'resource'
            ? (['cache', 'rate_limit', 'buffer', 'scanner', 'tracer', 'metrics'] satisfies ConnectComponentType[])
            : (addConnectorType ?? undefined)
        }
        isOpen={addConnectorType !== null}
        onAddConnector={page.actions.handleConnectorSelected}
        onCloseAddConnector={() => setAddConnectorType(null)}
        searchPlaceholder={getConnectorDialogPlaceholder(addConnectorType)}
        title={getConnectorDialogTitle(addConnectorType)}
      />

      {config.isTemplateGalleryEnabled && config.mode !== 'view' ? (
        <TemplateGalleryDialog
          onClose={(stashedYaml) => {
            if (stashedYaml !== null && stashedYaml !== undefined && stashedYaml !== '') {
              setYamlContent(stashedYaml);
            }
            setIsTemplateDialogOpen(false);
          }}
          onSubmit={({ pipelineName: suggestedName, yaml }) => {
            setYamlContent(yaml);
            if (!form.getValues('name')) {
              form.setValue('name', suggestedName, { shouldDirty: true, shouldValidate: true });
            }
            setIsTemplateDialogOpen(false);
            showToast({ status: 'success', title: 'Template applied — review the YAML and click Save to deploy.' });
          }}
          open={editorState.isTemplateDialogOpen}
        />
      ) : null}
    </>
  );
}
