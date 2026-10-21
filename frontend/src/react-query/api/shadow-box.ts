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

import { timestampDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, type Transport } from '@connectrpc/connect';
import { callUnaryMethod, createConnectQueryKey, useQuery, useTransport } from '@connectrpc/connect-query';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BOX_SETTINGS_UPDATE_PATHS,
  type BoxSummary,
  getBrokerProgress,
  isTransitionPhase,
  SHADOW_CLUSTER_CANT_BOX,
  sameBoxSettings,
  summarizeBox,
  toBoxPhase,
} from 'components/shadow-box/shadow-box-model';
import { config, isFeatureFlagEnabled, isServerless } from 'config';
import {
  box,
  getShadowBoxStatus,
  unbox,
  updateShadowBoxSettings,
} from 'protogen/redpanda/api/console/v1alpha1/shadowbox-ShadowBoxService_connectquery';
import type { GetShadowBoxStatusResponse } from 'protogen/redpanda/core/admin/v2/shadow_box_pb';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useShadowBoxStore } from 'stores/shadow-box-store';
import {
  createShadowBoxSimulatorTransport,
  isShadowBoxSimulatorEnabled,
  SHADOW_BOX_SIMULATOR_EVENT,
  SHADOW_BOX_SIMULATOR_STORAGE_KEY,
} from 'utils/shadow-box-simulator';

const TRANSITION_POLL_MS = 1500;
const STEADY_POLL_MS = 15_000;
/** A change still applying after this long is waiting on a broker that isn't answering, so ease off. */
const STALLED_TRANSITION_MS = 2 * 60 * 1000;
const STALLED_POLL_MS = 10_000;

const transitionPollMs = (data: GetShadowBoxStatusResponse | undefined): number => {
  const changedAt = data?.box?.stateChangedAt;
  const stalled = changedAt !== undefined && Date.now() - timestampDate(changedAt).getTime() > STALLED_TRANSITION_MS;
  return stalled ? STALLED_POLL_MS : TRANSITION_POLL_MS;
};

const subscribeToSimulator = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHADOW_BOX_SIMULATOR_STORAGE_KEY) {
      onChange();
    }
  };
  window.addEventListener(SHADOW_BOX_SIMULATOR_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(SHADOW_BOX_SIMULATOR_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
};

/**
 * The Cutover tab reads the source's box through the host, or has the operator confirm it by hand,
 * so it needs only the flag: whether this shadow cluster serves the Shadow Box API doesn't matter.
 */
export const isCutoverAvailable = (): boolean => isFeatureFlagEnabled('enableShadowBoxing') && !isServerless();

const useShadowBoxSimulatorEnabled = () =>
  useSyncExternalStore(subscribeToSimulator, isShadowBoxSimulatorEnabled, () => false);

/**
 * Shadow boxing is shown when its flag is on and this cluster's backend serves the Shadow Box API,
 * or when the dev simulator stands in for it. Serverless clusters can't be shadow link sources.
 */
const useShadowBoxAvailability = (): boolean => {
  const supported = useSupportedFeaturesStore((state) => state.shadowBoxService);
  const simulated = useShadowBoxSimulatorEnabled();
  return isFeatureFlagEnabled('enableShadowBoxing') && !isServerless() && (supported || simulated);
};

/** One simulator transport per cluster, so every consumer shares the same status query. */
const simulatorTransports = new Map<string, Transport>();

const getSimulatorTransport = (clusterKey: string): Transport => {
  let transport = simulatorTransports.get(clusterKey);
  if (!transport) {
    transport = createShadowBoxSimulatorTransport(clusterKey);
    simulatorTransports.set(clusterKey, transport);
  }
  return transport;
};

const useShadowBoxTransport = () => {
  const transport = useTransport();
  const simulated = useShadowBoxSimulatorEnabled();
  return simulated ? getSimulatorTransport(config.clusterId ?? 'default') : transport;
};

const statusQueryKey = () => createConnectQueryKey({ schema: getShadowBoxStatus, cardinality: 'finite' });

const invalidateStatus = (queryClient: QueryClient, options?: { cancelRefetch: boolean }) =>
  queryClient.invalidateQueries({ queryKey: statusQueryKey(), exact: false }, options);

/** These mean the API isn't there for this viewer, which reads as "no box to show", not as an error. */
const UNAVAILABLE_CODES = new Set([Code.Unimplemented, Code.NotFound, Code.PermissionDenied]);

const isShadowBoxUnavailableError = (error: unknown): boolean =>
  error instanceof ConnectError && UNAVAILABLE_CODES.has(error.code);

/**
 * The cluster's shadow box, polled quickly while brokers are still applying a change. Every
 * consumer shares one query, so the banner, the Shadow Links page and the write guards agree.
 * A viewer the API isn't there for stops polling, and every surface hides as if it were off.
 */
export const useShadowBoxStatusQuery = () => {
  const available = useShadowBoxAvailability();
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();
  const setPhase = useShadowBoxStore((state) => state.setPhase);

  const query = useQuery(
    getShadowBoxStatus,
    {},
    {
      transport,
      enabled: available,
      retry: (failureCount, error) => !isShadowBoxUnavailableError(error) && failureCount < 2,
      refetchInterval: (state) => {
        if (isShadowBoxUnavailableError(state.state.error)) {
          return false;
        }
        return isTransitionPhase(toBoxPhase(state.state.data?.box?.state))
          ? transitionPollMs(state.state.data)
          : STEADY_POLL_MS;
      },
      refetchOnWindowFocus: (state) => !isShadowBoxUnavailableError(state.state.error),
      /** Once the API is known to be missing, a newly mounted guard or banner doesn't ask again. */
      retryOnMount: false,
    }
  );

  useEffect(() => {
    if (!available) {
      return;
    }
    // Every mounted consumer hears the same event; joining the refetch already in flight keeps it to one.
    return subscribeToSimulator(() => {
      invalidateStatus(queryClient, { cancelRefetch: false });
    });
  }, [available, queryClient]);

  const unavailable = isShadowBoxUnavailableError(query.error);
  const summary = useMemo(() => summarizeBox(query.data?.box), [query.data]);
  const brokers = useMemo(() => getBrokerProgress(query.data), [query.data]);
  const known = available && !unavailable && query.data !== undefined;

  useEffect(() => {
    setPhase(known ? summary.phase : null);
  }, [known, summary.phase, setPhase]);

  return {
    ...query,
    /** The flag is on and this cluster can serve the API, and it hasn't said this viewer can't use it. */
    available: available && !unavailable,
    /** True once a status has loaded; until then, treat the cluster as unboxed. */
    known,
    summary,
    brokers,
  };
};

export type BoxSettingsInput = {
  exemptPrincipals: string[];
  allowAllReads: boolean;
  skipTransactionExpiration: boolean;
};

const toSettingsInit = (settings: BoxSettingsInput) => ({
  readPolicy: { exemptPrincipals: settings.exemptPrincipals, allowAllReads: settings.allowAllReads },
  skipTransactionExpiration: settings.skipTransactionExpiration,
});

/** Matches `isStaleRevisionError`, so it reads like the server's own stale-revision failure. */
const staleRevision = () => new ConnectError('the shadow box revision has changed', Code.FailedPrecondition);

/**
 * Box always uses the saved settings. When the dialog changed them, this saves them first and boxes
 * at the revision the save returned, but only if that box still carries exactly these settings: the
 * response can already include someone else's later change, and Box must not apply settings nobody
 * here reviewed.
 *
 * `savedBox` is the box as this hook's own save left it, until `reset`. When Box fails after the save,
 * the box has moved on to that revision because of this call, not someone else.
 */
export const useBoxClusterMutation = () => {
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();
  const [savedBox, setSavedBox] = useState<BoxSummary>();

  const mutation = useMutation({
    mutationFn: async ({ settings, opened }: { settings: BoxSettingsInput; opened: BoxSummary }) => {
      let { revision } = opened;
      if (!sameBoxSettings(settings, opened)) {
        const saved = summarizeBox(
          (
            await callUnaryMethod(transport, updateShadowBoxSettings, {
              settings: toSettingsInit(settings),
              updateMask: { paths: BOX_SETTINGS_UPDATE_PATHS },
              expectedRevision: opened.revision,
            })
          ).box
        );
        if (!sameBoxSettings(settings, saved)) {
          throw staleRevision();
        }
        setSavedBox(saved);
        ({ revision } = saved);
      }
      return callUnaryMethod(transport, box, { expectedRevision: revision });
    },
    onSettled: () => invalidateStatus(queryClient),
  });

  const { reset: resetMutation } = mutation;
  const reset = useCallback(() => {
    setSavedBox(undefined);
    resetMutation();
  }, [resetMutation]);
  return { ...mutation, savedBox, reset };
};

export const useUpdateShadowBoxSettingsMutation = () => {
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ settings, expectedRevision }: { settings: BoxSettingsInput; expectedRevision: bigint }) =>
      callUnaryMethod(transport, updateShadowBoxSettings, {
        settings: toSettingsInit(settings),
        updateMask: { paths: BOX_SETTINGS_UPDATE_PATHS },
        expectedRevision,
      }),
    onSettled: () => invalidateStatus(queryClient),
  });
};

/** Sends the revision the dialog opened with, so a stale tab can't release a box someone has since re-applied. */
export const useUnboxClusterMutation = () => {
  const transport = useShadowBoxTransport();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ expectedRevision }: { expectedRevision: bigint }) =>
      callUnaryMethod(transport, unbox, { expectedRevision }),
    onSettled: () => invalidateStatus(queryClient),
  });
};

const STALE_REVISION = /revision has changed/i;
const SHADOW_LINK_CONFIGURED = /shadow link is configured/i;
const FEATURE_INACTIVE = /feature is not active/i;

/** A stale `expected_revision`: someone else changed the box since this page read it. */
export const isStaleRevisionError = (error: unknown): boolean =>
  error instanceof ConnectError && error.code === Code.FailedPrecondition && STALE_REVISION.test(error.rawMessage);

/** Turns a Shadow Box API failure into a sentence that says what to do next. */
export const describeShadowBoxError = (error: unknown): string => {
  if (!(error instanceof ConnectError)) {
    return error instanceof Error ? error.message : String(error);
  }
  if (isStaleRevisionError(error)) {
    return 'The shadow box changed while this was open. Review its current status, then try again.';
  }
  if (error.code === Code.FailedPrecondition && SHADOW_LINK_CONFIGURED.test(error.rawMessage)) {
    return SHADOW_CLUSTER_CANT_BOX;
  }
  if (error.code === Code.FailedPrecondition && FEATURE_INACTIVE.test(error.rawMessage)) {
    return 'Shadow boxing isn’t active on this cluster yet. Every broker must run a Redpanda version that supports it.';
  }
  if (error.code === Code.DeadlineExceeded) {
    return 'The request timed out and may still apply. Check the box status before you try again.';
  }
  if (error.code === Code.PermissionDenied) {
    return 'You don’t have permission to change this cluster’s shadow box.';
  }
  if (error.code === Code.Unavailable) {
    return 'The cluster isn’t available right now. Try again in a moment.';
  }
  return error.rawMessage;
};

/** A sentence for a status read that failed, which unlike a change has nothing that may still apply. */
export const describeShadowBoxReadError = (error: unknown): string => {
  if (error instanceof ConnectError && error.code === Code.DeadlineExceeded) {
    return 'The cluster didn’t answer in time.';
  }
  if (error instanceof ConnectError && error.code === Code.PermissionDenied) {
    return 'You don’t have permission to view this cluster’s shadow box.';
  }
  return describeShadowBoxError(error);
};
