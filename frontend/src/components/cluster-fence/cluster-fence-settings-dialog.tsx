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
import { useEffect } from 'react';
import { Controller, type UseFormReturn, useForm } from 'react-hook-form';
import {
  isStaleRevisionError,
  useClusterFenceStatusQuery,
  useUpdateClusterFenceSettingsMutation,
} from 'react-query/api/cluster-fence';
import { toast } from 'sonner';
import { z } from 'zod';

import { type FenceSummary, isBlockingPhase, toExemptName } from './cluster-fence-model';
import { ClusterFenceSettingsFields, readPolicySchema, useReaderSuggestions } from './cluster-fence-settings-fields';
import { FenceChangedNotice, FenceWriteErrorAlert, useOpenedFence } from './fence-dialog-parts';

const formSchema = z.object({ settings: readPolicySchema });

type FormValues = z.infer<typeof formSchema>;

/** The form mounts with the dialog's content, so every opening starts from the saved settings. */
export const ClusterFenceSettingsDialog = ({
  open,
  onOpenChange,
  addPrincipal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A user to add to the exempt list as an unsaved edit, such as a shadow link's user. */
  addPrincipal?: string;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent size="lg" testId="cluster-fence-settings-dialog">
      <ClusterFenceSettingsForm addPrincipal={addPrincipal} onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

/** Added as an edit, not a default, so the dialog opens ready to save it. */
const useAddedPrincipal = (form: UseFormReturn<FormValues>, addPrincipal: string | undefined) => {
  useEffect(() => {
    const name = addPrincipal === undefined ? '' : toExemptName(addPrincipal);
    const settings = form.getValues('settings');
    if (name && !settings.exemptPrincipals.includes(name)) {
      // The whole object, not the nested path: the fields render from the `settings` Controller.
      form.setValue(
        'settings',
        { ...settings, exemptPrincipals: [...settings.exemptPrincipals, name] },
        { shouldDirty: true }
      );
    }
  }, [addPrincipal, form]);
};

const toFormValues = (summary: FenceSummary): FormValues => ({
  settings: { exemptPrincipals: summary.exemptPrincipals, allowAllReads: summary.allowAllReads },
});

const ClusterFenceSettingsForm = ({ onClose, addPrincipal }: { onClose: () => void; addPrincipal?: string }) => {
  const { summary } = useClusterFenceStatusQuery();
  const updateSettings = useUpdateClusterFenceSettingsMutation();
  const { opened, changed, refresh } = useOpenedFence(summary, updateSettings.isPending || updateSettings.isSuccess);

  /** Saving while a fence is requested makes every broker apply the new settings, back through Fencing. */
  const refences = isBlockingPhase(opened.phase);
  const suggestions = useReaderSuggestions();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(opened),
  });
  useAddedPrincipal(form, addPrincipal);

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
            description: refences
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
        {changed ? <FenceChangedNotice onRefresh={handleRefresh} refreshLabel="Load the current settings" /> : null}
        {refences ? (
          <Alert testId="cluster-fence-settings-refence" variant="informative">
            <AlertDescription>
              <p>
                {opened.phase === 'fenced'
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
            <ClusterFenceSettingsFields onChange={field.onChange} suggestions={suggestions} value={field.value} />
          )}
        />
        {updateSettings.error && !(changed && isStaleRevisionError(updateSettings.error)) ? (
          <FenceWriteErrorAlert
            error={updateSettings.error}
            testId="cluster-fence-settings-error"
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
          testId="save-cluster-fence-settings"
          type="submit"
        >
          Save settings
        </Button>
      </DialogFooter>
    </form>
  );
};
