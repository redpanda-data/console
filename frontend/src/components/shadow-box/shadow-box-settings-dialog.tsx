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
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
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
import { Controller, useForm } from 'react-hook-form';
import {
  isStaleRevisionError,
  useShadowBoxStatusQuery,
  useUpdateShadowBoxSettingsMutation,
} from 'react-query/api/shadow-box';
import { toast } from 'sonner';
import { z } from 'zod';

import { BoxChangedNotice, BoxWriteErrorAlert, useOpenedBox } from './box-dialog-parts';
import { type BoxSummary, isBlockingPhase } from './shadow-box-model';
import { readPolicySchema, ShadowBoxSettingsFields, useReaderSuggestions } from './shadow-box-settings-fields';

const formSchema = z.object({ settings: readPolicySchema });

type FormValues = z.infer<typeof formSchema>;

/** The form mounts with the dialog's content, so every opening starts from the saved settings. */
export const ShadowBoxSettingsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent size="lg" testId="shadow-box-settings-dialog">
      <ShadowBoxSettingsForm onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const toFormValues = (summary: BoxSummary): FormValues => ({
  settings: { exemptPrincipals: summary.exemptPrincipals, allowAllReads: summary.allowAllReads },
});

const ShadowBoxSettingsForm = ({ onClose }: { onClose: () => void }) => {
  const { summary } = useShadowBoxStatusQuery();
  const updateSettings = useUpdateShadowBoxSettingsMutation();
  const { opened, changed, refresh } = useOpenedBox(summary, updateSettings.isPending || updateSettings.isSuccess);

  /** Saving while a box is requested makes every broker apply the new settings, back through Boxing. */
  const reboxes = isBlockingPhase(opened.phase);
  const suggestions = useReaderSuggestions();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(opened),
  });

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
          toast.success('Cluster fence settings saved', {
            description: reboxes
              ? 'The cluster is in Fencing until every broker has them. Writes stay blocked the whole time.'
              : 'The next Fence uses them.',
          });
          onClose();
        },
      }
    );
  });

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
      <DialogHeader align="left">
        <DialogTitle>Cluster fence settings</DialogTitle>
        <DialogDescription>
          The cluster keeps one set of settings. Fence uses them, and they stay saved after Unfence.
        </DialogDescription>
      </DialogHeader>
      <DialogBody spacing="lg">
        {changed ? <BoxChangedNotice onRefresh={handleRefresh} refreshLabel="Load the current settings" /> : null}
        {reboxes ? (
          <Alert testId="shadow-box-settings-rebox" variant="informative">
            <AlertDescription>
              <p>
                {opened.phase === 'boxed'
                  ? 'Saving puts the cluster back in Fencing'
                  : 'Saving keeps the cluster in Fencing'}{' '}
                until every broker has the new settings. Writes stay blocked the whole time. A link the old settings
                blocked can read from each broker once that broker has them.
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
          <BoxWriteErrorAlert
            error={updateSettings.error}
            testId="shadow-box-settings-error"
            title="Couldn’t save the settings"
          />
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
