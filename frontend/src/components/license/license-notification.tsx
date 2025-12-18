import { Alert, AlertDescription, AlertIcon, Box, Button, Flex } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink, useLocation } from 'react-router-dom';

import {
  coreHasEnterpriseFeatures,
  getMillisecondsToExpiration,
  getPrettyTimeToExpiration,
  licenseIsExpired,
  licenseSoonToExpire,
  MS_IN_DAY,
  prettyLicenseType,
} from './license-utils';
import { License_Source, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backend-api';
import { capitalizeFirst } from '../../utils/utils';

export const LicenseNotification = observer(() => {
  const location = useLocation();

  // This Global License Notification banner is used only for Enterprise licenses
  // Trial Licences are handled by OverviewLicenseNotification and FeatureLicenseNotification.
  // Community Licenses can't expire at all.
  const enterpriseLicenses = api.licenses.filter((license) => license.type === License_Type.ENTERPRISE);

  const visibleExpiredEnterpriseLicenses = enterpriseLicenses.filter(licenseIsExpired) ?? [];
  const soonToExpireLicenses = enterpriseLicenses.filter((license) => licenseSoonToExpire(license)) ?? [];

  const showSomeLicenseExpirationInfo =
    (visibleExpiredEnterpriseLicenses.length > 0 && api.licenseViolation) || soonToExpireLicenses.length;

  if (api.licensesLoaded === undefined) {
    return null;
  }

  // For these paths, we don't need to show a notification banner because the pages themselves handle license management
  if (location.pathname === '/upload-license' || location.pathname === '/trial-expired') {
    return null;
  }

  if (!showSomeLicenseExpirationInfo) {
    return null;
  }

  const activeEnterpriseFeatures = api.enterpriseFeaturesUsed.filter((x) => x.enabled);

  const visibleSoonToExpireLicenses =
    soonToExpireLicenses.length > 1 && new Set(soonToExpireLicenses.map((x) => x.expiresAt)).size === 1
      ? soonToExpireLicenses.filter((x) => x.source === License_Source.REDPANDA_CORE)
      : soonToExpireLicenses;

  const visibleExpiredLicenses =
    visibleExpiredEnterpriseLicenses.length > 1 &&
    new Set(visibleExpiredEnterpriseLicenses.map((x) => x.expiresAt)).size === 1
      ? visibleExpiredEnterpriseLicenses.filter((x) => x.source === License_Source.REDPANDA_CORE)
      : visibleExpiredEnterpriseLicenses;

  return (
    <Box data-testid="license-notification">
      <Alert
        data-testid="license-alert"
        mb={4}
        status={
          visibleExpiredLicenses.length > 0 ||
          api.licenseViolation ||
          soonToExpireLicenses.some((license) => {
            const WARNING_THRESHOLD_DAYS = 15;
            const msToExpiration = getMillisecondsToExpiration(license);
            return msToExpiration > -1 && msToExpiration < WARNING_THRESHOLD_DAYS * MS_IN_DAY;
          })
            ? 'warning'
            : 'info'
        }
        variant="subtle"
      >
        <AlertIcon />
        <AlertDescription>
          {visibleSoonToExpireLicenses.length > 0 && (
            <>
              {capitalizeFirst(
                visibleSoonToExpireLicenses
                  .map(
                    (license) =>
                      `your ${prettyLicenseType(license, true)} license will expire in ${getPrettyTimeToExpiration(license)}`
                  )
                  .join(' and ')
              )}
              .{' '}
            </>
          )}

          {visibleExpiredLicenses.length > 0 && api.licenseViolation && (
            <>
              {capitalizeFirst(
                visibleExpiredLicenses
                  .map((license) => `your ${prettyLicenseType(license, true)} license has expired`)
                  .join(' and ')
              )}
              .{' '}
            </>
          )}

          {coreHasEnterpriseFeatures(api.enterpriseFeaturesUsed) && (
            <>
              You're using {activeEnterpriseFeatures.length === 1 ? 'an enterprise feature' : 'enterprise features'}{' '}
              <strong>{activeEnterpriseFeatures.map((x) => x.name).join(', ')}</strong> in your connected Redpanda
              cluster.{' '}
              {Boolean(api.licenseViolation) &&
                (activeEnterpriseFeatures.length === 1
                  ? 'This feature requires a license.'
                  : 'These features require a license.')}
            </>
          )}

          <Flex gap={2} my={2}>
            {Boolean(api.isAdminApiConfigured) && (
              <Button as={ReactRouterLink} size="sm" to="/upload-license" variant="outline">
                Upload license
              </Button>
            )}
            <Button
              as="a"
              href="https://support.redpanda.com/"
              rel="noopener noreferrer"
              size="sm"
              target="_blank"
              variant="outline"
            >
              Request a license
            </Button>
          </Flex>
        </AlertDescription>
      </Alert>
    </Box>
  );
});
