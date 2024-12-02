import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink, useLocation } from 'react-router-dom';
import { License_Source, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backendApi';
import { getPrettyTimeToExpiration, licenseIsExpired, licenseSoonToExpire, prettyLicenseType } from './licenseUtils';

export const LicenseNotification = observer(() => {
  const location = useLocation();

  // This Global License Notification banner is used only for Enterprise licenses
  // Trial Licences are handled by OverviewLicenseNotification and FeatureLicenseNotification.
  // Community Licenses can't expire at all.
  const enterpriseLicenses = api.licenses.filter((license) => license.type === License_Type.ENTERPRISE);

  const visibleExpiredEnterpriseLicenses = enterpriseLicenses.filter(licenseIsExpired) ?? [];
  const soonToExpireLicenses = enterpriseLicenses.filter((license) => licenseSoonToExpire(license)) ?? [];

  const showSomeLicenseExpirationInfo = visibleExpiredEnterpriseLicenses.length || soonToExpireLicenses.length;

  if (api.licensesLoaded === undefined) {
    return null;
  }

  // For these paths, we don't need to show a notification banner because the pages themselves handle license management
  if (location.pathname === '/admin/upload-license' || location.pathname === '/trial-expired') {
    return null;
  }

  if (!showSomeLicenseExpirationInfo && !api.licenseViolation) {
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
    <Box>
      <Alert mb={4} status={
          visibleExpiredLicenses.length > 0 || api.licenseViolation ? 'warning' : 'info'
      } variant="subtle">
        <AlertIcon />
        <AlertDescription>
          {visibleSoonToExpireLicenses.length > 0 && (
            <Box>
              {visibleSoonToExpireLicenses.map((license, idx) => (
                <Text key={idx}>
                  Your {prettyLicenseType(license, true)} license is expiring in {getPrettyTimeToExpiration(license)}.
                </Text>
              ))}
            </Box>
          )}

          {visibleExpiredLicenses.length > 0 && (
            <Box>
              {visibleExpiredLicenses.map((license, idx) => (
                <Text key={idx}>Your {prettyLicenseType(license, true)} license has expired.</Text>
              ))}
            </Box>
          )}

          {api.licenseViolation && (
            <Text>
              You're using {activeEnterpriseFeatures.length === 1 ? 'an enterprise feature' : 'enterprise features'}{' '}
              <strong>{activeEnterpriseFeatures.map((x) => x.name).join(', ')}</strong> in your connected Redpanda
              cluster.{' '}
              {activeEnterpriseFeatures.length === 1
                ? 'This feature requires a license'
                : 'These features require a license'}
              .
            </Text>
          )}

          <Flex gap={2} my={2}>
            {api.isAdminApiConfigured && (
              <Button variant="outline" size="sm" as={ReactRouterLink} to="/admin/upload-license">
                Upload license
              </Button>
            )}
            <Button variant="outline" size="sm" as="a" target="_blank" href="https://support.redpanda.com/">
              Request a license
            </Button>
          </Flex>
        </AlertDescription>
      </Alert>
    </Box>
  );
});
