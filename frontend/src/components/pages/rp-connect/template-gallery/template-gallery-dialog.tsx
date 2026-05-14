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
import { ArrowLeft } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useId, useMemo, useRef, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';

import type { PipelineTemplate } from './pipeline-template-types';
import { TemplateFormPanel, type TemplateFormPanelHandle, type TemplateFormSubmitPayload } from './template-form-panel';
import { TemplateGalleryGrid } from './template-gallery-grid';

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

/**
 * Dialog view state.
 *
 * `selectedTemplate` is held independently of `view` so the underlying
 * `TemplateFormPanel` stays mounted across `form ↔ addSecret` transitions and
 * its react-hook-form state is preserved when the user returns from the inline
 * secret-creation step.
 */
type DialogView =
  | { kind: 'gallery' }
  | { kind: 'form' }
  | { kind: 'addSecret'; slotId: string; suggestedName: string | undefined };

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: state-machine UI with three distinct render branches (gallery / form / addSecret) — extracting further would obscure the rendered tree.
export const TemplateGalleryDialog = ({ open, onClose, onSubmit, isSubmitting }: TemplateGalleryDialogProps) => {
  const [view, setView] = useState<DialogView>({ kind: 'gallery' });
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate | null>(null);
  const formHandleRef = useRef<TemplateFormPanelHandle | null>(null);
  const formId = useId();

  const isFormViewActive = view.kind === 'form';
  const isAddSecretViewActive = view.kind === 'addSecret';
  const isFormMounted = selectedTemplate !== null && (isFormViewActive || isAddSecretViewActive);

  const resetToGallery = () => {
    setView({ kind: 'gallery' });
    setSelectedTemplate(null);
    formHandleRef.current = null;
  };

  const closeWithStash = () => {
    const stashed = isFormMounted && formHandleRef.current?.isDirty() ? formHandleRef.current.getCurrentYaml() : null;
    onClose(stashed);
    resetToGallery();
  };

  // Existing-secrets query used by both the guided form's secret slots and the
  // inline secret-create step. Mounted once at the dialog level so the slot
  // dropdown and the create-step share a single cache.
  const { data: secretsResponse, refetch: refetchSecrets } = useListSecretsQuery({}, { enabled: open });
  const existingSecrets = useMemo(
    () => (secretsResponse?.secrets ?? []).map((s) => s?.id ?? '').filter(Boolean),
    [secretsResponse]
  );

  const handleSecretCreated = (secretNames?: string[]) => {
    refetchSecrets();
    const created = secretNames?.[0];
    if (created && view.kind === 'addSecret') {
      formHandleRef.current?.setSlotValue(view.slotId, created);
    }
    setView({ kind: 'form' });
  };

  return (
    <Dialog onOpenChange={(nextOpen) => (nextOpen ? undefined : closeWithStash())} open={open}>
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

        {/* Form body — mounted once and rendered across both form & addSecret views; */}
        {/* visibility toggled via CSS so react-hook-form state survives back-and-forth. */}
        {isFormMounted && selectedTemplate ? (
          <DialogBody className={isFormViewActive ? '' : 'hidden'}>
            <TemplateFormPanel
              formId={formId}
              onRequestCreateSecret={(slotId, suggestedName) => setView({ kind: 'addSecret', slotId, suggestedName })}
              onSubmit={onSubmit}
              ref={formHandleRef}
              template={selectedTemplate}
            />
          </DialogBody>
        ) : null}

        {isAddSecretViewActive ? (
          <DialogBody>
            <QuickAddSecrets
              cardVariant="ghost"
              enableNewSecrets
              existingSecrets={existingSecrets}
              onSecretsCreated={handleSecretCreated}
              requiredSecrets={view.kind === 'addSecret' && view.suggestedName ? [view.suggestedName] : []}
              scopes={[Scope.REDPANDA_CONNECT]}
            />
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
