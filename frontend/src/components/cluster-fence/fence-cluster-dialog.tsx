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

import { Code, ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { isShadowLinkingDisabledError } from 'components/pages/shadowlinks/shadowlink-helpers';
import { TonedIcon } from 'components/pages/shared/toned-icon';
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
import { Field, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import type { ShadowLinkTopology } from 'federation/types';
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  isStaleRevisionError,
  useClusterFenceStatusQuery,
  useFenceClusterMutation,
} from 'react-query/api/cluster-fence';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { z } from 'zod';

import {
  type BrokerProgress,
  canFenceFromPhase,
  FENCE_PHASE_LABEL,
  type FenceSummary,
  linksThatStopFence,
  type ReadPolicy,
} from './cluster-fence-model';
import {
  ClusterFenceSettingsFields,
  type PrincipalSuggestion,
  readPolicySchema,
  useReaderSuggestions,
} from './cluster-fence-settings-fields';
import { FenceChangedNotice, FenceWriteErrorAlert, useOpenedFence } from './fence-dialog-parts';
import { getFencePreflightChecks, type PreflightStatus } from './fence-preflight';

const FALLBACK_CONFIRMATION = 'fence';

const formSchema = z.object({ settings: readPolicySchema, confirmation: z.string() });

type FormValues = z.infer<typeof formSchema>;

const PREFLIGHT_ICON: Record<PreflightStatus, React.ReactNode> = {
  pending: <TonedIcon aria-label="Checking" className="size-4 shrink-0" icon={LoaderCircleIcon} spin tone="muted" />,
  pass: <TonedIcon aria-label="Passed" className="size-4 shrink-0" icon={CircleCheckIcon} tone="success" />,
  warn: <TonedIcon aria-label="Warning" className="size-4 shrink-0" icon={CircleAlertIcon} tone="warning" />,
  fail: <TonedIcon aria-label="Blocks fencing" className="size-4 shrink-0" icon={CircleXIcon} tone="destructive" />,
};

/** The form mounts with the dialog's content, so every opening starts from the fence as it is then. */
export const FenceClusterDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent size="lg" testId="fence-cluster-dialog">
      <FenceClusterForm onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

const fenceErrorTitle = (error: unknown, settingsSaved: boolean) => {
  if (error instanceof ConnectError && error.code === Code.DeadlineExceeded) {
    return 'The call timed out, and may still apply';
  }
  return settingsSaved ? 'Settings saved, but the cluster isn’t fenced' : 'Couldn’t fence the cluster';
};

/** This cluster's own links that haven't failed over: while any remain, it's a shadow and Fence fails. */
const ownLinksState = (query: ReturnType<typeof useListShadowLinksQuery>) => {
  if (query.data) {
    return linksThatStopFence(query.data.shadowLinks).map((link) => link.name);
  }
  if (isShadowLinkingDisabledError(query.error)) {
    return 'disabled';
  }
  return query.isError ? 'error' : 'loading';
};

const seedSettings = (summary: FenceSummary, suggestions: PrincipalSuggestion[]): ReadPolicy => ({
  exemptPrincipals: Array.from(
    new Set([...summary.exemptPrincipals, ...suggestions.map(({ principal }) => principal)])
  ),
  allowAllReads: summary.allowAllReads,
});

const FenceEffects = ({ allowAllReads }: { allowAllReads: boolean }) => (
  <section aria-label="What fencing changes" className="flex flex-col gap-1.5">
    <h3 className="text-label">While fenced, the cluster rejects</h3>
    <ul className="list-disc space-y-1 pl-5 text-body-sm">
      <li>Producing to user topics</li>
      {allowAllReads ? null : <li>Reading from user topics, except by exempt users</li>}
      <li>Creating, deleting or reconfiguring topics</li>
      <li>Consumer group joins, heartbeats and offset commits</li>
      <li>Schema Registry, ACL and role changes</li>
      <li>New shadow links, data migrations and cluster recovery</li>
    </ul>
    <p className="text-body-sm text-muted-foreground">
      Open transactions are ended. Retention and compaction keep running, and you can still manage users and cluster
      config.
    </p>
  </section>
);

const useFenceSettingsForm = (opened: FenceSummary, suggestions: PrincipalSuggestion[]) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { settings: seedSettings(opened, suggestions), confirmation: '' },
  });

  // Readers can arrive from the host after the dialog opens; pre-add their users until the user edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new set of suggestions reseeds
  useEffect(() => {
    if (!form.getFieldState('settings').isDirty) {
      form.resetField('settings', { defaultValue: seedSettings(opened, suggestions) });
    }
  }, [suggestions]);

  const settings = useWatch({ control: form.control, name: 'settings' });
  const confirmation = useWatch({ control: form.control, name: 'confirmation' });
  return { form, settings, confirmation };
};

const useFencePreflight = (topology: ShadowLinkTopology | null, brokers: BrokerProgress[], settings: ReadPolicy) => {
  const ownLinksQuery = useListShadowLinksQuery({});
  const checks = getFencePreflightChecks({
    linksThatStopFence: ownLinksState(ownLinksQuery),
    brokers,
    exemptPrincipals: settings.exemptPrincipals,
    allowAllReads: settings.allowAllReads,
    readers: topology ? topology.readers : undefined,
    readersResolving: topology?.resolving ?? false,
    readersIncomplete: topology?.readersIncomplete ?? false,
  });
  /** A shadow cluster can't be fenced, so Fence waits until the own-links check has an answer. */
  const blocked = checks.some(
    (check) => check.status === 'fail' || (check.id === 'own-links' && check.status === 'pending')
  );
  return { checks, blocked };
};

const useFenceClusterForm = () => {
  const { summary, brokers } = useClusterFenceStatusQuery();
  const topology = useClusterFenceStore((state) => state.topology);
  const fenceCluster = useFenceClusterMutation();
  const openedFence = useOpenedFence(
    summary,
    fenceCluster.isPending || fenceCluster.isSuccess,
    fenceCluster.savedFence
  );
  const suggestions = useReaderSuggestions();
  const settingsForm = useFenceSettingsForm(openedFence.opened, suggestions);
  const preflight = useFencePreflight(topology, brokers, settingsForm.settings);
  return { summary, topology, fenceCluster, ...openedFence, suggestions, ...settingsForm, ...preflight };
};

const FenceClusterForm = ({ onClose }: { onClose: () => void }) => {
  const {
    summary,
    topology,
    fenceCluster,
    opened,
    changed,
    refresh,
    suggestions,
    form,
    settings,
    confirmation,
    checks,
    blocked,
  } = useFenceClusterForm();
  const clusterName = topology?.clusterName;
  const confirmationTarget = clusterName ?? FALLBACK_CONFIRMATION;
  const confirmed = confirmation.trim() === confirmationTarget;
  const alreadyFenced = !canFenceFromPhase(opened.phase);

  const handleRefresh = () => {
    refresh();
    form.resetField('settings', { defaultValue: seedSettings(summary, suggestions) });
    fenceCluster.reset();
  };

  const handleSubmit = form.handleSubmit((values) => {
    fenceCluster.mutate(
      { settings: values.settings, opened },
      {
        onSuccess: () => {
          toast.success(`Fencing ${clusterName ?? 'this cluster'}`);
          onClose();
        },
      }
    );
  });

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
      <DialogHeader align="left">
        <DialogTitle>Fence {clusterName ?? 'this cluster'}?</DialogTitle>
        <DialogDescription>
          {settings.allowAllReads
            ? 'Writes are rejected until you unfence the cluster. Consumers keep reading.'
            : 'Writes are rejected until you unfence the cluster, and only the exempt users below can read.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody spacing="lg">
        {changed ? <FenceChangedNotice onRefresh={handleRefresh} refreshLabel="Review the current fence" /> : null}
        {!changed && alreadyFenced ? (
          <Alert testId="fence-cluster-already-fenced" variant="informative">
            <AlertTitle>This cluster is already {FENCE_PHASE_LABEL[opened.phase].toLowerCase()}</AlertTitle>
            <AlertDescription>
              <p>It was fenced while this was open. Close this dialog to see its status.</p>
            </AlertDescription>
          </Alert>
        ) : null}

        <FenceEffects allowAllReads={settings.allowAllReads} />

        <Controller
          control={form.control}
          name="settings"
          render={({ field }) => (
            <ClusterFenceSettingsFields onChange={field.onChange} suggestions={suggestions} value={field.value} />
          )}
        />

        {checks.length > 0 ? (
          <section aria-label="Before you fence" className="flex flex-col gap-2">
            <h3 className="text-label">Before you fence</h3>
            <ul className="flex flex-col gap-1.5" data-testid="fence-preflight-checks">
              {checks.map((check) => (
                <li
                  className="flex items-start gap-2 text-body-sm"
                  data-status={check.status}
                  data-testid={`fence-preflight-${check.id}`}
                  key={check.id}
                >
                  <span className="mt-0.5">{PREFLIGHT_ICON[check.status]}</span>
                  {check.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Field>
          <FieldLabel htmlFor="fence-cluster-confirmation">
            Type <span className="font-mono">{confirmationTarget}</span> to confirm
          </FieldLabel>
          <Input
            autoComplete="off"
            id="fence-cluster-confirmation"
            placeholder={confirmationTarget}
            testId="fence-cluster-confirmation"
            {...form.register('confirmation')}
          />
        </Field>

        {fenceCluster.error && !(changed && isStaleRevisionError(fenceCluster.error)) ? (
          <FenceWriteErrorAlert
            error={fenceCluster.error}
            testId="fence-cluster-error"
            title={fenceErrorTitle(fenceCluster.error, fenceCluster.savedFence !== undefined)}
          >
            {/* After this dialog's own save went through, a failed Fence leaves the new settings in place. */}
            {fenceCluster.savedFence ? (
              <p>
                The settings above are saved. Fence again to retry, or cancel to leave the cluster unfenced with them.
              </p>
            ) : null}
          </FenceWriteErrorAlert>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={blocked || !confirmed || changed || alreadyFenced}
          isLoading={fenceCluster.isPending}
          testId="confirm-fence-cluster"
          type="submit"
          variant="destructive"
        >
          Fence cluster
        </Button>
      </DialogFooter>
    </form>
  );
};
