import {
  consoleHasEnterpriseFeature,
  getLatestExpiringLicense,
  getMillisecondsToExpiration,
  isBakedInTrial,
  prettyLicenseType,
} from 'components/license/license-utils';

import type { LegacyApiServices } from './legacy-api-services';
import { addHeapEventProperties } from '../heap/heap.helper';
import type {
  CreateDebugBundleRequest,
  CreateDebugBundleResponse,
} from '../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import type { SetLicenseRequest, SetLicenseResponse } from '../protogen/redpanda/api/console/v1alpha1/license_pb';
import { config as appConfig } from '../runtime-config';
import type { GetApiState, SetApiState } from '../state/backend-api';
import { isPresent } from '../utils/type-guards';

export function createLegacyLicenseActions(set: SetApiState, get: GetApiState, _services: LegacyApiServices) {
  return {
    async uploadLicense(request: SetLicenseRequest): Promise<SetLicenseResponse> {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.licenseClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('Console client is not initialized');
      }
      const r = await client.setLicense(request);

      return r;
    },
    async listLicenses(): Promise<void> {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.licenseClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('License client is not initialized');
      }

      await Promise.all([
        client
          .listEnterpriseFeatures({})
          .then((enterpriseFeaturesResponse) => {
            set({
              enterpriseFeaturesUsed: enterpriseFeaturesResponse.features,
              licenseViolation: enterpriseFeaturesResponse.violation,
            });
          })
          .catch((error: unknown) => {
            const errorText = error instanceof Error ? error.message : String(error);

            // biome-ignore lint/suspicious/noConsole: intentional console usage
            console.log(`error listing enterprise features: ${errorText}`);
          }),
        client
          .listLicenses({})
          .then((licensesResponse) => {
            set({ licenses: licensesResponse.licenses, licensesLoaded: 'loaded' });
          })
          .catch((error: unknown) => {
            set({ licensesLoaded: 'failed' });
            const errorText = error instanceof Error ? error.message : String(error);

            // biome-ignore lint/suspicious/noConsole: intentional console usage
            console.log(`error refreshing licenses: ${errorText}`);
            return error;
          }),
      ]);

      if (get().licenses.length > 0) {
        const license = getLatestExpiringLicense(get().licenses);
        if (license !== undefined) {
          addHeapEventProperties({
            BakedInTrial: isBakedInTrial(license),
            LicenseType: prettyLicenseType(license),
            MillisecondsToExpiration: getMillisecondsToExpiration(license),
          });
        }
      }
      addHeapEventProperties({
        SSOEnabled: consoleHasEnterpriseFeature('SINGLE_SIGN_ON'),
      });
    },
  };
}

export function createLegacyDebugBundleActions(set: SetApiState, get: GetApiState, _services: LegacyApiServices) {
  return {
    refreshClusterHealth() {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.debugBundleClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('Debug bundle client is not initialized');
      }

      return client.getClusterHealth({}).then((response) => {
        set({ clusterHealth: response });
      });
    },
    async refreshDebugBundleStatuses() {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.debugBundleClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('Debug bundle client is not initialized');
      }

      await client
        .getDebugBundleStatus({})
        .then((response) => {
          set({ debugBundleStatuses: response.brokerStatuses, hasDebugProcess: response.hasDebugProcess });
          return response;
        })
        .catch((error: unknown) => {
          set({ debugBundleStatuses: [] });
          return error;
        });
    },
    async createDebugBundle(request: CreateDebugBundleRequest): Promise<CreateDebugBundleResponse> {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.debugBundleClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('Debug bundle client is not initialized');
      }

      return await client.createDebugBundle(request).finally(() => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        get().refreshDebugBundleStatuses().catch(console.error);
      });
    },
    async cancelDebugBundleProcess({ jobId }: { jobId: string }) {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.debugBundleClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('Debug bundle client is not initialized');
      }

      await client
        .cancelDebugBundleProcess({
          jobId,
        })
        .finally(() => {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          get().refreshDebugBundleStatuses().catch(console.error);
        });
    },
    async deleteDebugBundleFile() {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.debugBundleClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('Debug bundle client is not initialized');
      }
      await client
        .deleteDebugBundleFile({
          deleteAll: true,
        })
        .finally(() => {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          get().refreshDebugBundleStatuses().catch(console.error);
        });
    },
  };
}
