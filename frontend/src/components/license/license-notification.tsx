import { Link, useLocation } from '@tanstack/react-router';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { buttonVariants } from 'components/redpanda-ui/components/button';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';

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
import { api, useApiStoreHook } from '../../state/backend-api';
import { capitalizeFirst } from '../../utils/utils';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
export const LicenseNotification = () => {
  const licenses = useApiStoreHook((s) => s.licenses);
  const licensesLoaded = useApiStoreHook((s) => s.licensesLoaded);
  const licenseViolation = useApiStoreHook((s) => s.licenseViolation);
  const enterpriseFeaturesUsed = useApiStoreHook((s) => s.enterpriseFeaturesUsed);
  const location = useLocation();

  useEffect(() => {
    api.listLicenses().catch(() => {
      // Error handling managed by API layer
    });
  }, []);

  // This Global License Notification banner is used only for Enterprise licenses
  // Trial Licences are handled by OverviewLicenseNotification and FeatureLicenseNotification.
  // Community Licenses can't expire at all.
  const enterpriseLicenses = licenses.filter((license) => license.type === License_Type.ENTERPRISE);

  const visibleExpiredEnterpriseLicenses = enterpriseLicenses.filter(licenseIsExpired) ?? [];
  const soonToExpireLicenses = enterpriseLicenses.filter((license) => licenseSoonToExpire(license)) ?? [];

  const showSomeLicenseExpirationInfo =
    (visibleExpiredEnterpriseLicenses.length > 0 && licenseViolation) || soonToExpireLicenses.length;

  if (licensesLoaded === undefined) {
    return null;
  }

  // For these paths, we don't need to show a notification banner because the pages themselves handle license management
  if (location.pathname === '/upload-license' || location.pathname === '/trial-expired') {
    return null;
  }

  if (!showSomeLicenseExpirationInfo) {
    return null;
  }

  const activeEnterpriseFeatures = enterpriseFeaturesUsed.filter((x) => x.enabled);

  const visibleSoonToExpireLicenses =
    soonToExpireLicenses.length > 1 && new Set(soonToExpireLicenses.map((x) => x.expiresAt)).size === 1
      ? soonToExpireLicenses.filter((x) => x.source === License_Source.REDPANDA_CORE)
      : soonToExpireLicenses;

  const visibleExpiredLicenses =
    visibleExpiredEnterpriseLicenses.length > 1 &&
    new Set(visibleExpiredEnterpriseLicenses.map((x) => x.expiresAt)).size === 1
      ? visibleExpiredEnterpriseLicenses.filter((x) => x.source === License_Source.REDPANDA_CORE)
      : visibleExpiredEnterpriseLicenses;

  const isWarning =
    visibleExpiredLicenses.length > 0 ||
    licenseViolation ||
    soonToExpireLicenses.some((license) => {
      const WARNING_THRESHOLD_DAYS = 15;
      const msToExpiration = getMillisecondsToExpiration(license);
      return msToExpiration > -1 && msToExpiration < WARNING_THRESHOLD_DAYS * MS_IN_DAY;
    });

  return (
    <div data-testid="license-notification">
      <Alert
        className="mb-4"
        data-testid="license-alert"
        icon={isWarning ? <TriangleAlertIcon /> : <InfoIcon />}
        variant={isWarning ? 'warning' : 'informative'}
      >
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

          {visibleExpiredLicenses.length > 0 && licenseViolation && (
            <>
              {capitalizeFirst(
                visibleExpiredLicenses
                  .map((license) => `your ${prettyLicenseType(license, true)} license has expired`)
                  .join(' and ')
              )}
              .{' '}
            </>
          )}

          {coreHasEnterpriseFeatures(enterpriseFeaturesUsed) && (
            <>
              You're using {activeEnterpriseFeatures.length === 1 ? 'an enterprise feature' : 'enterprise features'}{' '}
              <strong>{activeEnterpriseFeatures.map((x) => x.name).join(', ')}</strong> in your connected Redpanda
              cluster.{' '}
              {Boolean(licenseViolation) &&
                (activeEnterpriseFeatures.length === 1
                  ? 'This feature requires a license.'
                  : 'These features require a license.')}
            </>
          )}

          {/* Both CTAs navigate, so they stay anchors and keep the link role; Button would impose
              role="button". AlertDescription puts `[&_a]:link-inline` on every descendant anchor, so
              the button-styled ones need to opt out. */}
          <div className="[&_a]:!no-underline my-2 flex gap-2">
            {Boolean(api.isAdminApiConfigured) && (
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/upload-license">
                Upload license
              </Link>
            )}
            <a
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              href="https://support.redpanda.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Request a license
            </a>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
};
