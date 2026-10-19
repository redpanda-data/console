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
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
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
import { Label } from 'components/redpanda-ui/components/label';
import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { BOX_PHASE_LABEL, type BoxSummary, canBoxFromPhase, exemptNameFor, linksThatStopBox } from './shadow-box-model';
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

const boxErrorTitle = (error: unknown, settingsSaved: boolean) => {
  if (error instanceof ConnectError && error.code === Code.DeadlineExceeded) {
    return 'The call timed out, and may still apply';
  }
  return settingsSaved ? 'Settings saved, but the cluster isn’t boxed' : 'Couldn’t box the cluster';
};

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
    <AlertTitle>{boxErrorTitle(error, settingsSaved)}</AlertTitle>
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

/** This cluster's own links that haven't failed over: while any remain, it's a shadow and Box fails. */
const ownLinksState = (query: ReturnType<typeof useListShadowLinksQuery>) => {
  if (query.data) {
    return linksThatStopBox(query.data.shadowLinks).map((link) => link.name);
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
      <h3 className="text-label">Rejects</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-body-sm">
        <li>Producing to user topics. Producers get REQUEST_TIMED_OUT and keep retrying.</li>
        {allowAllReads ? null : <li>Fetching from user topics, except for the exempt users below</li>}
        <li>Creating or deleting topics, or adding partitions</li>
        <li>Committing or deleting consumer offsets, and deleting consumer groups</li>
        <li>Every Schema Registry write</li>
        <li>Creating or deleting ACLs, and creating, changing or deleting roles</li>
        <li>Creating shadow links, new data migrations and cluster recovery</li>
      </ul>
    </div>
    <div>
      <h3 className="text-label">Keeps working</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-body-sm">
        {allowAllReads ? <li>Fetching from topics</li> : null}
        <li>Topic config changes, which may not reach the shadow</li>
        <li>DeleteRecords, retention and compaction</li>
        <li>Consumer group membership and offset fetches</li>
        <li>Users and their SCRAM passwords</li>
        <li>Cluster config, decommission and partition moves</li>
        <li>Internal topics, such as __consumer_offsets</li>
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
      (topology?.readers ?? []).flatMap((reader) => {
        const principal = exemptNameFor(reader);
        return principal === undefined ? [] : [{ principal, linkName: reader.linkName }];
      }),
    [topology?.readers]
  );
  /** An empty exempt list locks every shadow link out, and the broker only logs it, so ask first. */
  const [lockOutAcknowledged, setLockOutAcknowledged] = useState(false);

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
    linksThatStopBox: ownLinksState(ownLinksQuery),
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
  const locksOutReaders = !settings.allowAllReads && settings.exemptPrincipals.length === 0;

  const handleSubmit = form.handleSubmit((values) => {
    boxCluster.mutate(
      { settings: values.settings, opened },
      {
        onSuccess: () => {
          toast.success(`Boxing ${clusterName ?? 'this cluster'}`, {
            description:
              'Each broker rejects writes as soon as it picks up the box. Wait for Boxed before you fail a link over.',
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
            ? 'Each broker rejects writes as soon as it picks up the box, until you unbox it. Consumers keep reading.'
            : 'Each broker rejects writes as soon as it picks up the box, until you unbox it. Only the exempt users below can still fetch from user topics, so your shadow links can finish copying.'}
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

        <section aria-label="Settings" className="flex flex-col gap-1">
          <h3 className="text-label">1. Save settings</h3>
          <p className="text-body-sm text-muted-foreground">
            Box uses the saved settings, so these are saved first if you changed them. The box always covers every
            resource it supports; there’s no scope to choose.
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
          <h3 className="text-label">2. Box</h3>
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

        {locksOutReaders ? (
          <div className="flex items-start gap-2">
            <Checkbox
              checked={lockOutAcknowledged}
              id="box-cluster-lock-out"
              onCheckedChange={(checked) => setLockOutAcknowledged(checked === true)}
              testId="box-cluster-lock-out"
            />
            <Label className="font-normal" htmlFor="box-cluster-lock-out">
              Box with no one exempt, blocking every consumer and shadow link
            </Label>
          </div>
        ) : null}

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
          disabled={blocked || !confirmed || changed || alreadyBoxed || (locksOutReaders && !lockOutAcknowledged)}
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
