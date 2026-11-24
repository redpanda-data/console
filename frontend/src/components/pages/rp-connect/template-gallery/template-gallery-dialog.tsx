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
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import type { AddTopicFormData, BaseStepRef, StepSubmissionResult } from '../types/wizard';

export type TemplateGalleryDialogProps = {
  open: boolean;
  onClose: (stashedYaml: string | null) => void;
  onSubmit: (payload: TemplateFormSubmitPayload) => void;
};

// WARNING: Keep the selected template separate from the current step so opening a nested form cannot discard unsaved inputs.
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

const viewFlagsFor = (view: DialogView, selectedTemplate: PipelineTemplate | null) => {
  const isFormViewActive = view.kind === 'form';
  const isAddSecretViewActive = view.kind === 'addSecret';
  const isCreateTopicViewActive = view.kind === 'createTopic';
  return {
    isFormViewActive,
    isAddSecretViewActive,
    isCreateTopicViewActive,
    isFormMounted: selectedTemplate !== null && (isFormViewActive || isAddSecretViewActive || isCreateTopicViewActive),
    isStepView: isAddSecretViewActive || isCreateTopicViewActive,
  };
};

const useTemplateDialogSteps = (open: boolean) => {
  const [view, setView] = useState<DialogView>({ kind: 'gallery' });
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate | null>(null);
  const [applySlotValue, setApplySlotValue] = useState<ApplySlotValueRequest | null>(null);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const formHandleRef = useRef<TemplateFormPanelHandle | null>(null);
  const addTopicStepRef = useRef<BaseStepRef<AddTopicFormData> | null>(null);

  const resetToGallery = () => {
    setView({ kind: 'gallery' });
    setSelectedTemplate(null);
    setApplySlotValue(null);
    setIsCreatingTopic(false);
    formHandleRef.current = null;
    addTopicStepRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      setView({ kind: 'gallery' });
      setSelectedTemplate(null);
      setApplySlotValue(null);
      setIsCreatingTopic(false);
      formHandleRef.current = null;
      addTopicStepRef.current = null;
    }
  }, [open]);

  return {
    view,
    setView,
    selectedTemplate,
    setSelectedTemplate,
    applySlotValue,
    setApplySlotValue,
    isCreatingTopic,
    setIsCreatingTopic,
    formHandleRef,
    addTopicStepRef,
    resetToGallery,
  };
};

const useExistingSecretIds = (open: boolean) => {
  const { data: secretsResponse } = useListSecretsQuery({}, { enabled: open });
  return useMemo(() => (secretsResponse?.secrets ?? []).map((s) => s?.id ?? '').filter(Boolean), [secretsResponse]);
};

/**
 * Keep the form mounted during the add-secret and create-topic subflows; hiding the wrapper preserves slot values.
 */
export const TemplateGalleryDialog = ({ open, onClose, onSubmit }: TemplateGalleryDialogProps) => {
  const {
    view,
    setView,
    selectedTemplate,
    setSelectedTemplate,
    applySlotValue,
    setApplySlotValue,
    isCreatingTopic,
    setIsCreatingTopic,
    formHandleRef,
    addTopicStepRef,
    resetToGallery,
  } = useTemplateDialogSteps(open);
  const formId = useId();
  const { isFormViewActive, isAddSecretViewActive, isCreateTopicViewActive, isFormMounted, isStepView } = viewFlagsFor(
    view,
    selectedTemplate
  );

  const closeWithStash = () => {
    const stashed = isFormMounted && formHandleRef.current?.isDirty() ? formHandleRef.current.getCurrentYaml() : null;
    onClose(stashed);
    resetToGallery();
  };

  const existingSecrets = useExistingSecretIds(open);

  const handleSecretsCreated = (names: string[]) => {
    const created = names[0];
    if (created && view.kind === 'addSecret') {
      setApplySlotValue({ slotId: view.slotId, value: created, requestId: Date.now() });
    }
    setView({ kind: 'form' });
  };

  const applyCreatedTopic = (slotId: string, result: StepSubmissionResult<AddTopicFormData>) => {
    if (result.success && result.data?.topicName) {
      setApplySlotValue({ slotId, value: result.data.topicName, requestId: Date.now() });
      setView({ kind: 'form' });
      return;
    }
    if (!result.success && result.error) {
      toast.error(result.message ?? result.error);
    }
  };

  const handleCreateTopicSubmit = async () => {
    if (view.kind !== 'createTopic' || !addTopicStepRef.current) {
      return;
    }
    setIsCreatingTopic(true);
    try {
      applyCreatedTopic(view.slotId, await addTopicStepRef.current.triggerSubmit());
    } finally {
      setIsCreatingTopic(false);
    }
  };

  return (
    <Dialog
      // WARNING: Do not allow backdrop clicks to dismiss a draft form; keep the explicit close actions that save its values.
      disablePointerDismissal={view.kind !== 'gallery'}
      onOpenChange={(nextOpen) => (nextOpen ? undefined : closeWithStash())}
      open={open}
    >
      <DialogContent height={isStepView ? 'auto' : 'xl'} size={isStepView ? 'lg' : 'xl'}>
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
            <AddTopicStep hideTitle inline ref={addTopicStepRef} selectionMode="new" />
          </DialogBody>
        ) : null}

        {isFormViewActive ? (
          <DialogFooter justify="between">
            <Button onClick={closeWithStash} type="button" variant="ghost">
              Cancel
            </Button>
            <Button data-testid="template-submit" form={formId} type="submit" variant="primary">
              Apply template
            </Button>
          </DialogFooter>
        ) : null}

        {isCreateTopicViewActive ? (
          <DialogFooter>
            <Button
              data-testid="template-create-topic-submit"
              disabled={isCreatingTopic}
              isLoading={isCreatingTopic}
              onClick={handleCreateTopicSubmit}
              type="button"
              variant="primary"
            >
              Create topic
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
