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

import { zodResolver } from '@hookform/resolvers/zod';
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
import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  describeShadowBoxError,
  isStaleRevisionError,
  useShadowBoxStatusQuery,
  useUpdateShadowBoxSettingsMutation,
} from 'react-query/api/shadow-box';
import { toast } from 'sonner';
import { useShadowBoxStore } from 'stores/shadow-box-store';
import { z } from 'zod';

import { BoxChangedNotice } from './box-changed-notice';
import { type BoxSummary, isBlockingPhase } from './shadow-box-model';
import { type PrincipalSuggestion, ShadowBoxSettingsFields } from './shadow-box-settings-fields';
import { useOpenedBox } from './use-opened-box';

const formSchema = z.object({
  settings: z.object({
    exemptPrincipals: z.array(z.string()),
    allowAllReads: z.boolean(),
    skipTransactionExpiration: z.boolean(),
  }),
});

type FormValues = z.infer<typeof formSchema>;

type ShadowBoxSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A user to add to the exempt principals as the dialog opens, such as a link the box blocks. */
  addPrincipal?: string;
};

/** The form mounts with the dialog's content, so every opening starts from the saved settings. */
export const ShadowBoxSettingsDialog = ({ open, onOpenChange, addPrincipal }: ShadowBoxSettingsDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent size="lg" testId="shadow-box-settings-dialog">
      <ShadowBoxSettingsForm addPrincipal={addPrincipal} onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const toFormValues = (summary: BoxSummary): FormValues => ({
  settings: {
    exemptPrincipals: summary.exemptPrincipals,
    allowAllReads: summary.allowAllReads,
    skipTransactionExpiration: summary.skipTransactionExpiration,
  },
});

const ShadowBoxSettingsForm = ({ onClose, addPrincipal }: { onClose: () => void; addPrincipal?: string }) => {
  const { summary } = useShadowBoxStatusQuery();
  const topology = useShadowBoxStore((state) => state.topology);
  const updateSettings = useUpdateShadowBoxSettingsMutation();
  const { opened, changed, refresh } = useOpenedBox(summary, updateSettings.isPending || updateSettings.isSuccess);
  const errorRef = useRef<HTMLDivElement>(null);

  // The error renders below the fold of a long dialog body; bring it into view.
  useEffect(() => {
    if (updateSettings.error) {
      errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [updateSettings.error]);

  /** Saving while a box is requested makes every broker apply the new settings, back through Boxing. */
  const reboxes = isBlockingPhase(opened.phase);

  const suggestions = useMemo<PrincipalSuggestion[]>(
    () =>
      (topology?.readers ?? []).flatMap((reader) =>
        reader.principal ? [{ principal: reader.principal, linkName: reader.linkName }] : []
      ),
    [topology?.readers]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(opened),
  });

  /** Added as an edit, not a default, so the dialog opens ready to save it. */
  useEffect(() => {
    const exempt = form.getValues('settings.exemptPrincipals');
    if (addPrincipal && !exempt.includes(addPrincipal)) {
      form.setValue('settings.exemptPrincipals', [...exempt, addPrincipal], { shouldDirty: true });
    }
  }, [addPrincipal, form]);

  const handleRefresh = () => {
    refresh();
    form.reset(toFormValues(summary));
    updateSettings.reset();
  };

  const handleSubmit = form.handleSubmit((values) => {
    updateSettings.mutate(
      { settings: values.settings, expectedRevision: opened.revision },
      {
        onSuccess: () => {
          toast.success('Shadow box settings saved', {
            description: reboxes
              ? 'The cluster is back in Boxing until every broker applies them.'
              : 'The next Box uses them.',
          });
          onClose();
        },
      }
    );
  });

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
      <DialogHeader align="left">
        <DialogTitle>Shadow box settings</DialogTitle>
        <DialogDescription>
          The cluster keeps one set of settings. Box uses them, and they stay saved after Unbox.
        </DialogDescription>
      </DialogHeader>
      <DialogBody spacing="lg">
        {changed ? <BoxChangedNotice onRefresh={handleRefresh} refreshLabel="Load the current settings" /> : null}
        {reboxes ? (
          <Alert testId="shadow-box-settings-rebox" variant="informative">
            <AlertDescription>
              <p>
                Saving puts the cluster back in Boxing until every broker applies the new settings. Writes stay blocked
                the whole time.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name="settings"
          render={({ field }) => (
            <ShadowBoxSettingsFields onChange={field.onChange} suggestions={suggestions} value={field.value} />
          )}
        />
        {updateSettings.error && !(changed && isStaleRevisionError(updateSettings.error)) ? (
          <Alert ref={errorRef} testId="shadow-box-settings-error" variant="destructive">
            <AlertTitle>Couldn’t save the settings</AlertTitle>
            <AlertDescription>
              <p>{describeShadowBoxError(updateSettings.error)}</p>
            </AlertDescription>
          </Alert>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={!form.formState.isDirty || changed}
          isLoading={updateSettings.isPending}
          testId="save-shadow-box-settings"
          type="submit"
        >
          Save settings
        </Button>
      </DialogFooter>
    </form>
  );
};
