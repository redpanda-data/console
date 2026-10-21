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
import { isShadowLinkingDisabledError } from 'components/pages/shadowlinks/shadowlink-helpers';
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
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  type BoxSettingsInput,
  describeShadowBoxError,
  isStaleRevisionError,
  useBoxClusterMutation,
  useShadowBoxStatusQuery,
} from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { useShadowBoxStore } from 'stores/shadow-box-store';
import { z } from 'zod';

import { BoxChangedNotice } from './box-changed-notice';
import { getBoxPreflightChecks, type PreflightStatus } from './box-preflight';
import { BOX_PHASE_LABEL, type BoxSummary, canBoxFromPhase } from './shadow-box-model';
import { type PrincipalSuggestion, ShadowBoxSettingsFields } from './shadow-box-settings-fields';
import { useOpenedBox } from './use-opened-box';

const FALLBACK_CONFIRMATION = 'box';

const formSchema = z.object({
  settings: z.object({
    exemptPrincipals: z.array(z.string()),
    allowAllReads: z.boolean(),
    skipTransactionExpiration: z.boolean(),
  }),
  confirmation: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const PREFLIGHT_ICON: Record<PreflightStatus, React.ReactNode> = {
  pending: (
    <LoaderCircleIcon
      aria-label="Checking"
      className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
    />
  ),
  pass: <CircleCheckIcon aria-label="Passed" className="size-4 shrink-0 text-success" />,
  warn: <CircleAlertIcon aria-label="Warning" className="size-4 shrink-0 text-warning" />,
  fail: <CircleXIcon aria-label="Blocks boxing" className="size-4 shrink-0 text-destructive" />,
};

const mergePrincipals = (saved: string[], suggestions: PrincipalSuggestion[]) =>
  Array.from(new Set([...saved, ...suggestions.map(({ principal }) => principal)]));

type BoxClusterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The form mounts with the dialog's content, so every opening starts from the box as it is then. */
export const BoxClusterDialog = ({ open, onOpenChange }: BoxClusterDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent size="lg" testId="box-cluster-dialog">
      <BoxClusterForm onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

/** After this dialog's own save went through, Box failing leaves the new settings in place; says so. */
const BoxErrorAlert = ({
  error,
  settingsSaved,
  ref,
}: {
  error: unknown;
  settingsSaved: boolean;
  ref: React.Ref<HTMLDivElement>;
}) => (
  <Alert ref={ref} testId="box-cluster-error" variant="destructive">
    <AlertTitle>
      {settingsSaved ? 'Settings saved, but the cluster isn’t boxed' : 'Couldn’t box the cluster'}
    </AlertTitle>
    <AlertDescription>
      <p>{describeShadowBoxError(error)}</p>
      {settingsSaved ? (
        <p>
          The read policy and transaction setting above are saved. Box again to retry, or cancel to leave the cluster
          unboxed with them.
        </p>
      ) : null}
    </AlertDescription>
  </Alert>
);

const ownLinksState = (query: ReturnType<typeof useListShadowLinksQuery>) => {
  if (query.data) {
    return query.data.shadowLinks.map((link) => link.name);
  }
  if (isShadowLinkingDisabledError(query.error)) {
    return 'disabled';
  }
  return query.isError ? 'error' : 'loading';
};

const seedSettings = (summary: BoxSummary, suggestions: PrincipalSuggestion[]): BoxSettingsInput => ({
  exemptPrincipals: mergePrincipals(summary.exemptPrincipals, suggestions),
  allowAllReads: summary.allowAllReads,
  skipTransactionExpiration: summary.skipTransactionExpiration,
});

const BoxEffects = ({ allowAllReads }: { allowAllReads: boolean }) => (
  <section aria-label="What boxing changes" className="grid gap-4 sm:grid-cols-2">
    <div>
      <h3 className="text-label">Stops</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-body-sm">
        <li>Producing to topics</li>
        {allowAllReads ? null : <li>Reading topics, except for the exempt principals below</li>}
        <li>Committing or resetting consumer offsets</li>
        <li>Creating or deleting topics, or adding partitions</li>
        <li>Changing ACLs, roles or schemas</li>
      </ul>
    </div>
    <div>
      <h3 className="text-label">Keeps working</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-body-sm">
        <li>Connections and metadata</li>
        {allowAllReads ? <li>Reading topics</li> : null}
        <li>Reading ACLs, roles and schemas</li>
        <li>Consumer group membership</li>
        <li>Users, credentials and the Admin API</li>
        <li>Retention and compaction, which still delete old data</li>
      </ul>
    </div>
  </section>
);

const BoxClusterForm = ({ onClose }: { onClose: () => void }) => {
  const { summary, brokers } = useShadowBoxStatusQuery();
  const ownLinksQuery = useListShadowLinksQuery({});
  const topology = useShadowBoxStore((state) => state.topology);
  const boxCluster = useBoxClusterMutation();
  const { opened, changed, refresh } = useOpenedBox(
    summary,
    boxCluster.isPending || boxCluster.isSuccess,
    boxCluster.savedBox
  );
  const errorRef = useRef<HTMLDivElement>(null);

  // The error renders below the fold of a long dialog body; bring it into view.
  useEffect(() => {
    if (boxCluster.error) {
      errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [boxCluster.error]);

  const clusterName = topology?.clusterName;
  const confirmationTarget = clusterName ?? FALLBACK_CONFIRMATION;
  const suggestions = useMemo<PrincipalSuggestion[]>(
    () =>
      (topology?.readers ?? []).flatMap((reader) =>
        reader.principal ? [{ principal: reader.principal, linkName: reader.linkName }] : []
      ),
    [topology?.readers]
  );

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

  const handleRefresh = () => {
    refresh();
    form.resetField('settings', { defaultValue: seedSettings(summary, suggestions) });
    boxCluster.reset();
  };

  const settings = useWatch({ control: form.control, name: 'settings' });
  const confirmation = useWatch({ control: form.control, name: 'confirmation' });

  const checks = getBoxPreflightChecks({
    ownShadowLinks: ownLinksState(ownLinksQuery),
    brokers,
    exemptPrincipals: settings.exemptPrincipals,
    allowAllReads: settings.allowAllReads,
    readers: topology ? topology.readers : undefined,
    readersResolving: topology?.resolving ?? false,
    readersIncomplete: topology?.readersIncomplete ?? false,
  });
  /** A shadow cluster can't be boxed, so Box waits until the own-links check has an answer. */
  const blocked = checks.some(
    (check) => check.status === 'fail' || (check.id === 'own-links' && check.status === 'pending')
  );
  const confirmed = confirmation.trim() === confirmationTarget;
  const alreadyBoxed = !canBoxFromPhase(opened.phase);

  const handleSubmit = form.handleSubmit((values) => {
    boxCluster.mutate(
      { settings: values.settings, opened },
      {
        onSuccess: () => {
          toast.success(`Boxing ${clusterName ?? 'this cluster'}`, {
            description: 'Brokers reject writes as they apply the box. It’s in force once every broker confirms.',
          });
          onClose();
        },
      }
    );
  });

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
      <DialogHeader align="left">
        <DialogTitle>Box {clusterName ?? 'this cluster'}?</DialogTitle>
        <DialogDescription>
          {settings.allowAllReads
            ? 'Producers start failing as soon as boxing begins, and no client can change topics, ACLs, roles or schemas until you unbox it. Consumers keep reading.'
            : 'Producers and consumers start failing as soon as boxing begins, and no client can change topics, ACLs, roles or schemas until you unbox it. Only the exempt principals below can still read, so your shadow links can finish syncing.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody spacing="lg">
        {changed ? <BoxChangedNotice onRefresh={handleRefresh} refreshLabel="Review the current box" /> : null}
        {!changed && alreadyBoxed ? (
          <Alert testId="box-cluster-already-boxed" variant="informative">
            <AlertTitle>This cluster is already {BOX_PHASE_LABEL[opened.phase].toLowerCase()}</AlertTitle>
            <AlertDescription>
              <p>It was boxed while this was open. Close this dialog to see its status.</p>
            </AlertDescription>
          </Alert>
        ) : null}

        <BoxEffects allowAllReads={settings.allowAllReads} />

        <section aria-label="Scope" className="flex flex-col gap-1">
          <h3 className="text-label">Scope</h3>
          <p className="text-body-sm">
            The entire cluster: every topic, consumer group offsets, Schema Registry, ACLs and roles.{' '}
            <span className="text-muted-foreground">This is the only scope in this version.</span>
          </p>
        </section>

        <Controller
          control={form.control}
          name="settings"
          render={({ field }) => (
            <ShadowBoxSettingsFields onChange={field.onChange} suggestions={suggestions} value={field.value} />
          )}
        />

        <section aria-label="Before you box" className="flex flex-col gap-2">
          <h3 className="text-label">Before you box</h3>
          <ul className="flex flex-col gap-1.5" data-testid="box-preflight-checks">
            {checks.map((check) => (
              <li
                className="flex items-start gap-2 text-body-sm"
                data-status={check.status}
                data-testid={`box-preflight-${check.id}`}
                key={check.id}
              >
                <span className="mt-0.5">{PREFLIGHT_ICON[check.status]}</span>
                {check.message}
              </li>
            ))}
          </ul>
        </section>

        <Field>
          <FieldLabel htmlFor="box-cluster-confirmation">
            Type <span className="font-mono">{confirmationTarget}</span> to confirm
          </FieldLabel>
          <Input
            autoComplete="off"
            id="box-cluster-confirmation"
            placeholder={confirmationTarget}
            testId="box-cluster-confirmation"
            {...form.register('confirmation')}
          />
        </Field>

        {boxCluster.error && !(changed && isStaleRevisionError(boxCluster.error)) ? (
          <BoxErrorAlert error={boxCluster.error} ref={errorRef} settingsSaved={boxCluster.savedBox !== undefined} />
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={blocked || !confirmed || changed || alreadyBoxed}
          isLoading={boxCluster.isPending}
          testId="confirm-box-cluster"
          type="submit"
          variant="destructive"
        >
          Box cluster
        </Button>
      </DialogFooter>
    </form>
  );
};
