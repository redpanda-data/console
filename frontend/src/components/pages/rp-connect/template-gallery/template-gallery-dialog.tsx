/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { QuickAddSecrets } from 'components/ui/secret/quick-add-secrets';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useId, useMemo, useRef, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { toast } from 'sonner';

import type { PipelineTemplate } from './pipeline-template-types';
import {
  type ApplySlotValueRequest,
  TemplateFormPanel,
  type TemplateFormPanelHandle,
  type TemplateFormSubmitPayload,
} from './template-form-panel';
import { TemplateGalleryGrid } from './template-gallery-grid';
import { AddTopicStep } from '../onboarding/add-topic-step';
import type { AddTopicFormData, BaseStepRef } from '../types/wizard';

export type TemplateGalleryDialogProps = {
  open: boolean;
  /**
   * Called when the dialog is closed via the X button, ESC, or backdrop click.
   * If the user got far enough into the guided form to enter a value, the
   * dialog will hand back the current stitched YAML via `stashedYaml`. Use this
   * to drop the partial config into the host editor so the user can continue
   * editing manually.
   */
  onClose: (stashedYaml: string | null) => void;
  /** Called when the user submits the form. Parent owns the deploy mutation. */
  onSubmit: (payload: TemplateFormSubmitPayload) => void;
  /** Render the form's "Create pipeline" button in a busy state. */
  isSubmitting?: boolean;
};

// `selectedTemplate` is tracked outside `view` so `TemplateFormPanel` stays
// mounted across `form ↔ addSecret ↔ createTopic` transitions and the user's
// in-progress form values survive the round-trip.
type DialogView =
  | { kind: 'gallery' }
  | { kind: 'form' }
  | { kind: 'addSecret'; slotId: string; suggestedName: string | undefined }
  | { kind: 'createTopic'; slotId: string };

const StepBackHeader = ({
  title,
  description,
  onBack,
  backLabel,
  backTestId,
}: {
  title: string;
  description: string;
  onBack: () => void;
  backLabel: string;
  backTestId: string;
}) => (
  <DialogHeader>
    <div className="flex items-start gap-2">
      <Button
        aria-label={backLabel}
        className="-ml-2 shrink-0"
        data-testid={backTestId}
        onClick={onBack}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
    </div>
  </DialogHeader>
);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: state-machine UI with four distinct render branches (gallery / form / addSecret / createTopic) — extracting further would obscure the rendered tree.
export const TemplateGalleryDialog = ({ open, onClose, onSubmit, isSubmitting }: TemplateGalleryDialogProps) => {
  const [view, setView] = useState<DialogView>({ kind: 'gallery' });
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate | null>(null);
  // Slot write requested by the in-dialog secret-creation step. The form panel
  // consumes it via a useEffect and then calls back to clear it. Routed
  // through props instead of an imperative ref because plain function
  // components don't receive `ref` as a prop in React 18.
  const [applySlotValue, setApplySlotValue] = useState<ApplySlotValueRequest | null>(null);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const formHandleRef = useRef<TemplateFormPanelHandle | null>(null);
  const addTopicStepRef = useRef<BaseStepRef<AddTopicFormData> | null>(null);
  const formId = useId();

  const isFormViewActive = view.kind === 'form';
  const isAddSecretViewActive = view.kind === 'addSecret';
  const isCreateTopicViewActive = view.kind === 'createTopic';
  const isFormMounted =
    selectedTemplate !== null && (isFormViewActive || isAddSecretViewActive || isCreateTopicViewActive);

  const resetToGallery = () => {
    setView({ kind: 'gallery' });
    setSelectedTemplate(null);
    setApplySlotValue(null);
    setIsCreatingTopic(false);
    formHandleRef.current = null;
    addTopicStepRef.current = null;
  };

  const closeWithStash = () => {
    const stashed = isFormMounted && formHandleRef.current?.isDirty() ? formHandleRef.current.getCurrentYaml() : null;
    onClose(stashed);
    resetToGallery();
  };

  const { data: secretsResponse } = useListSecretsQuery({}, { enabled: open });
  const existingSecrets = useMemo(
    () => (secretsResponse?.secrets ?? []).map((s) => s?.id ?? '').filter(Boolean),
    [secretsResponse]
  );

  const handleSecretsCreated = (names: string[]) => {
    const created = names[0];
    if (created && view.kind === 'addSecret') {
      setApplySlotValue({ slotId: view.slotId, value: created, requestId: Date.now() });
    }
    setView({ kind: 'form' });
  };

  const handleCreateTopicSubmit = async () => {
    if (view.kind !== 'createTopic' || !addTopicStepRef.current) {
      return;
    }
    setIsCreatingTopic(true);
    try {
      const result = await addTopicStepRef.current.triggerSubmit();
      if (result.success && result.data?.topicName) {
        setApplySlotValue({ slotId: view.slotId, value: result.data.topicName, requestId: Date.now() });
        setView({ kind: 'form' });
        return;
      }
      if (!result.success && result.error) {
        // AddTopicStep surfaces validation errors inside its own form; only
        // toast the higher-level "create failed" error so the user still sees
        // field-level errors in context.
        toast.error(result.message ?? result.error);
      }
    } finally {
      setIsCreatingTopic(false);
    }
  };

  return (
    <Dialog
      // Block backdrop dismissal past the gallery step so a stray click can't
      // wipe in-progress form values. ESC and the X / Cancel buttons still close.
      disablePointerDismissal={view.kind !== 'gallery'}
      onOpenChange={(nextOpen) => (nextOpen ? undefined : closeWithStash())}
      open={open}
    >
      <DialogContent height="xl" size="xl">
        {view.kind === 'gallery' ? (
          <>
            <DialogHeader>
              <DialogTitle>Start from a template</DialogTitle>
              <DialogDescription>
                Pick a pre-paired source-and-sink pattern. Fill in a short form and deploy a working pipeline.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <TemplateGalleryGrid
                onSelect={(template) => {
                  setSelectedTemplate(template);
                  setView({ kind: 'form' });
                }}
              />
            </DialogBody>
          </>
        ) : null}

        {isFormViewActive && selectedTemplate ? (
          <StepBackHeader
            backLabel="Back to templates"
            backTestId="template-form-back"
            description={selectedTemplate.description}
            onBack={resetToGallery}
            title={selectedTemplate.name}
          />
        ) : null}

        {isAddSecretViewActive ? (
          <StepBackHeader
            backLabel="Back to template form"
            backTestId="template-add-secret-back"
            description="Create a new Cloud secret. It will be auto-selected on the form when you return."
            onBack={() => setView({ kind: 'form' })}
            title="Add a secret"
          />
        ) : null}

        {isCreateTopicViewActive ? (
          <StepBackHeader
            backLabel="Back to template form"
            backTestId="template-create-topic-back"
            description="Create a new Redpanda topic. It will be auto-selected on the form when you return."
            onBack={() => setView({ kind: 'form' })}
            title="Create a topic"
          />
        ) : null}

        {/* Stays mounted across addSecret to preserve form state; hide via inline */}
        {/* style so the flex-1 outer doesn't reserve space (className targets inner). */}
        {isFormMounted && selectedTemplate ? (
          <DialogBody style={isFormViewActive ? undefined : { display: 'none' }}>
            <TemplateFormPanel
              applySlotValue={applySlotValue}
              formId={formId}
              onRequestCreateSecret={(slotId, suggestedName) => setView({ kind: 'addSecret', slotId, suggestedName })}
              onRequestCreateTopic={(slotId) => setView({ kind: 'createTopic', slotId })}
              onSlotValueApplied={() => setApplySlotValue(null)}
              onSubmit={onSubmit}
              ref={formHandleRef}
              template={selectedTemplate}
            />
          </DialogBody>
        ) : null}

        {isAddSecretViewActive ? (
          <DialogBody>
            <div className="flex flex-col gap-4">
              {view.kind === 'addSecret' && view.suggestedName ? (
                <Alert icon={<KeyRound />} variant="warning">
                  <AlertTitle>This template needs a secret</AlertTitle>
                  <AlertDescription>
                    <p className="text-pretty">
                      We've suggested <span className="font-mono font-semibold">{view.suggestedName}</span> — feel free
                      to adjust the name.
                    </p>
                  </AlertDescription>
                </Alert>
              ) : null}
              <QuickAddSecrets
                defaultNewSecretName={view.kind === 'addSecret' ? view.suggestedName : undefined}
                enableNewSecrets
                existingSecrets={existingSecrets}
                inline
                onSecretsCreated={handleSecretsCreated}
                requiredSecrets={[]}
                scopes={[Scope.REDPANDA_CONNECT]}
              />
            </div>
          </DialogBody>
        ) : null}

        {isCreateTopicViewActive ? (
          <DialogBody>
            <div className="flex flex-col gap-4">
              <AddTopicStep hideTitle inline ref={addTopicStepRef} selectionMode="new" />
              <div className="flex justify-end">
                <Button
                  data-testid="template-create-topic-submit"
                  disabled={isCreatingTopic}
                  onClick={handleCreateTopicSubmit}
                  type="button"
                  variant="primary"
                >
                  {isCreatingTopic ? 'Creating...' : 'Create topic'}
                </Button>
              </div>
            </div>
          </DialogBody>
        ) : null}

        {isFormViewActive ? (
          <DialogFooter justify="between">
            <Button onClick={closeWithStash} type="button" variant="ghost">
              Cancel
            </Button>
            <Button data-testid="template-submit" disabled={isSubmitting} form={formId} type="submit" variant="primary">
              {isSubmitting ? 'Creating...' : 'Apply template'}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
