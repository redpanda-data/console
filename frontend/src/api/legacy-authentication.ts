/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/*eslint block-scoped-var: "error"*/

import { Code, ConnectError } from '@connectrpc/connect';

import type { LegacyApiServices } from './legacy-api-services';
import { identityUserData } from '../api/user-permissions';
import { addHeapEventProperties, trackHeapUser } from '../heap/heap.helper';
import { trackHubspotUser } from '../hubspot/hubspot.helper';
import {
  AuthenticationMethod,
  type GetIdentityResponse,
} from '../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { KafkaDistribution } from '../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import { config as appConfig, isEmbedded } from '../runtime-config';
import { appGlobal } from '../state/app-global';
import type { GetApiState, SetApiState } from '../state/backend-api';
import type { UserData } from '../state/rest-interfaces';
import { rpcnEditorAutosave } from '../state/rpcn-editor-autosave';
import { env, getBuildDate } from '../utils/env';
import { isObject } from '../utils/type-guards';
import { getOidcSubject } from '../utils/utils';

// Embedded in Cloud, a failed identity call means "no Console permissions", not "log in".
function embeddedUserData(): UserData {
  return {
    displayName: '',
    avatarUrl: '',
    authenticationMethod: AuthenticationMethod.UNSPECIFIED,
    canListAcls: false,
    canListQuotas: false,
    canPatchConfigs: false,
    canReassignPartitions: false,
    canCreateRoles: false,
    canViewPermissionsList: false,
    canManageLicense: false,
    canManageUsers: false,
    canCreateSchemas: false,
    canDeleteSchemas: false,
    canManageSchemaRegistry: false,
    canViewSchemas: false,
    canListTransforms: false,
    canCreateTransforms: false,
    canDeleteTransforms: false,
    canViewDebugBundle: false,
    canViewConsoleUsers: false,
  };
}
// Where an identity failure sends the user, or null for a transient error that keeps them on the page.
function authFailureRedirect(err: unknown): string | null {
  if (!isObject(err)) {
    return null;
  }
  // Authentication failure (401) - redirect to login
  if (err.code === Code.Unauthenticated) {
    return '/login';
  }

  // Permission denied (403) - redirect with error info
  if (err.code === Code.PermissionDenied) {
    // TODO - solve typings, provide corresponding Reason type
    const subject = getOidcSubject(err);
    return `/login?error_code=permission_denied&oidc_subject=${String(subject)}`;
  }

  return null;
}

export function createLegacyAuthenticationActions(set: SetApiState, get: GetApiState, _services: LegacyApiServices) {
  return {
    async logout() {
      await appConfig.fetch('./auth/logout');
      // Recovery buffers hold unsaved configuration verbatim; they must not outlive the session.
      rpcnEditorAutosave.clearAll();
      set({ userData: null });
    },
    async refreshUserData() {
      // Prevent duplicate concurrent requests to avoid redirect loops
      if (get().isUserDataFetchInProgress) {
        return;
      }
      set({ isUserDataFetchInProgress: true });

      const client = appConfig.authenticationClient;
      if (!client) {
        set({ isUserDataFetchInProgress: false });
        throw new Error('security client is not initialized');
      }

      await client
        .getIdentity({})
        .then((r: GetIdentityResponse) => {
          // Clear any previous error on success
          set({ userDataError: null });
          set({
            userData: identityUserData(r),
          });

          // Track user in analytics after successful authentication
          if (r.displayName) {
            const userData = {
              firstName: r.displayName.split(' ')[0] || r.displayName,
              lastName: r.displayName.split(' ').slice(1).join(' ') || '',
              email: r.displayName, // Using displayName as email fallback
            };
            trackHubspotUser(userData);
            trackHeapUser(userData);
          }
        })
        .catch((error: unknown) => {
          // Clear previous error
          set({ userDataError: null });

          if (isEmbedded()) {
            // Create a mocked empty userData with all permissions set to false
            set({ userData: embeddedUserData() });
            return;
          }

          const redirect = authFailureRedirect(error);
          if (redirect !== null && redirect !== undefined && redirect !== '') {
            set({ userData: null });
            appGlobal.historyPush(redirect);
            return;
          }

          // Transient errors (5xx: Unavailable, DeadlineExceeded, Internal, Unknown)
          // Do NOT redirect to login - this causes infinite loops
          // Keep userData as undefined and store error for UI to display
          set({ userDataError: ConnectError.from(error) });
        })
        .finally(() => {
          set({ isUserDataFetchInProgress: false });
          addHeapEventProperties({
            'Product Name': 'Console',
            Platform: get().clusterOverview.kafka?.distribution === KafkaDistribution.REDPANDA ? 'Redpanda' : 'Kafka',
            'Cluster Version': get().clusterOverview?.kafka?.version,
            Version: env.REACT_APP_CONSOLE_PLATFORM_VERSION,
            'Build Date': getBuildDate(),
          });
        });
    },

    // Fetch errors
  };
}
