import { Link, useLocation } from '@tanstack/react-router';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { buttonVariants } from 'components/redpanda-ui/components/button';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  coreHasEnterpriseFeatures,
  getMillisecondsToExpiration,
  getPrettyTimeToExpiration,
  licenseIsExpired,
  licenseSoonToExpire,
  MS_IN_DAY,
  prettyLicenseType,
} from './license-utils';
import { type License, License_Source, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api, useApiStoreHook } from '../../state/backend-api';
import { capitalizeFirst } from '../../utils/utils';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
export const LicenseNotification = () => {
  const { licenses, licensesLoaded, licenseViolation, enterpriseFeaturesUsed } = useApiStoreHook(
    useShallow((state) => ({
      licenses: state.licenses,
      licensesLoaded: state.licensesLoaded,
      licenseViolation: state.licenseViolation,
      enterpriseFeaturesUsed: state.enterpriseFeaturesUsed,
    }))
  );
  const location = useLocation();

  useEffect(() => {
    api.listLicenses().catch(() => {
      // Error handling managed by API layer
    });
  }, []);

  const { showSomeLicenseExpirationInfo, visibleSoonToExpireLicenses, visibleExpiredLicenses, isWarning } =
    getLicenseExpirationInfo(licenses, licenseViolation);

  if (
    licensesLoaded === undefined ||
    location.pathname === '/upload-license' ||
    location.pathname === '/trial-expired' ||
    !showSomeLicenseExpirationInfo
  ) {
    return null;
  }

  const activeEnterpriseFeatures = enterpriseFeaturesUsed.filter((x) => x.enabled);

  return (
    <div data-testid="license-notification">
      <Alert
        // my-4, not on the wrapper: that div is a direct child of #mainLayout, whose
        // `margin: 0 !important` (index-cloud-integration.scss) would drop it.
        className="my-4"
        data-testid="license-alert"
        icon={isWarning ? <TriangleAlertIcon /> : <InfoIcon />}
        variant={isWarning ? 'warning' : 'informative'}
      >
        <AlertDescription>
          {/* One block child: AlertDescription is a grid, so loose text runs each become a row. */}
          <p>
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
          </p>

          {/* Both CTAs navigate, preserving link semantics. */}
          <div className="my-2 flex gap-2">
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

function preferCoreLicenseForSharedExpiry(licenses: License[]): License[] {
  return licenses.length > 1 && new Set(licenses.map((license) => license.expiresAt)).size === 1
    ? licenses.filter((license) => license.source === License_Source.REDPANDA_CORE)
    : licenses;
}

function getLicenseExpirationInfo(licenses: License[], licenseViolation: boolean | undefined) {
  // This Global License Notification banner is used only for Enterprise licenses
  // Trial Licences are handled by OverviewLicenseNotification and FeatureLicenseNotification.
  // Community Licenses can't expire at all.
  const enterpriseLicenses = licenses.filter((license) => license.type === License_Type.ENTERPRISE);

  const visibleExpiredEnterpriseLicenses = enterpriseLicenses.filter(licenseIsExpired) ?? [];
  const soonToExpireLicenses = enterpriseLicenses.filter((license) => licenseSoonToExpire(license)) ?? [];

  const showSomeLicenseExpirationInfo =
    (visibleExpiredEnterpriseLicenses.length > 0 && licenseViolation) || soonToExpireLicenses.length;

  const visibleSoonToExpireLicenses = preferCoreLicenseForSharedExpiry(soonToExpireLicenses);
  const visibleExpiredLicenses = preferCoreLicenseForSharedExpiry(visibleExpiredEnterpriseLicenses);

  const isWarning =
    visibleExpiredLicenses.length > 0 ||
    licenseViolation ||
    soonToExpireLicenses.some((license) => {
      const WARNING_THRESHOLD_DAYS = 15;
      const msToExpiration = getMillisecondsToExpiration(license);
      return msToExpiration > -1 && msToExpiration < WARNING_THRESHOLD_DAYS * MS_IN_DAY;
    });

  return { showSomeLicenseExpirationInfo, visibleSoonToExpireLicenses, visibleExpiredLicenses, isWarning };
}
