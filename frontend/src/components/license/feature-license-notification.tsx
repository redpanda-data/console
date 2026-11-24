import { Link } from 'components/redpanda-ui/components/typography';
import { type FC, type ReactElement, useEffect, useState } from 'react';

import {
  coreHasEnterpriseFeatures,
  ENTERPRISE_FEATURES_DOCS_LINK,
  getEnterpriseCTALink,
  getLatestExpiringLicense,
  getMillisecondsToExpiration,
  getPrettyExpirationDate,
  getPrettyTimeToExpiration,
  isBakedInTrial,
  LICENSE_WEIGHT,
  MS_IN_DAY,
  RegisterButton,
  UpgradeButton,
  UploadLicenseButton,
} from './license-utils';
import { RegisterModal } from './register-modal';
import {
  type License,
  License_Type,
  type ListEnterpriseFeaturesResponse_Feature,
} from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backend-api';
import { Alert, AlertDescription } from '../redpanda-ui/components/alert';

const WARNING_THRESHOLD_DAYS = 5;

// biome-ignore lint/nursery/useMaxParams: Refactoring to options object would require updating all call sites
const getLicenseAlertContentForFeature: (
  _featureName: 'rbac' | 'reassignPartitions',
  license: License | undefined,
  enterpriseFeaturesUsed: ListEnterpriseFeaturesResponse_Feature[],
  bakedInTrial: boolean,
  onRegisterModalOpen: () => void
) => { message: ReactElement; variant: 'destructive' | 'informative' } | null = (
  _featureName,
  license,
  enterpriseFeaturesUsed,
  bakedInTrial,
  onRegisterModalOpen
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
) => {
  if (license === undefined) {
    return null;
  }

  const msToExpiration = getMillisecondsToExpiration(license);

  if (license.type === License_Type.TRIAL && api.isRedpanda) {
    if (bakedInTrial) {
      return {
        message: (
          <div>
            <p>This is an enterprise feature. Register for an additional 30 days of enterprise features.</p>
            <div className="my-2 flex gap-2">
              <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
            </div>
          </div>
        ),
        variant: msToExpiration > WARNING_THRESHOLD_DAYS * MS_IN_DAY ? 'informative' : 'destructive',
      };
    }
    return {
      message: (
        <div>
          <p>This is an enterprise feature.</p>
        </div>
      ),
      variant: msToExpiration > WARNING_THRESHOLD_DAYS * MS_IN_DAY ? 'informative' : 'destructive',
    };
  }

  return api.isRedpanda
    ? getRedpandaFeatureAlert(license, msToExpiration, enterpriseFeaturesUsed)
    : getKafkaFeatureAlert(license, msToExpiration);
};

function getRedpandaFeatureAlert(
  license: License,
  msToExpiration: number,
  enterpriseFeaturesUsed: ListEnterpriseFeaturesResponse_Feature[]
): { message: ReactElement; variant: 'destructive' | 'informative' } | null {
  if (
    msToExpiration > 15 * MS_IN_DAY &&
    msToExpiration < 30 * MS_IN_DAY &&
    coreHasEnterpriseFeatures(enterpriseFeaturesUsed)
  ) {
    return {
      message: (
        <div>
          <p>This is an enterprise feature, active until {getPrettyExpirationDate(license)}.</p>
          <div className="my-2 flex gap-2">
            <UploadLicenseButton />
            <UpgradeButton />
          </div>
        </div>
      ),
      variant: 'informative',
    };
  }
  if (msToExpiration > -1 && msToExpiration < 15 * MS_IN_DAY && coreHasEnterpriseFeatures(enterpriseFeaturesUsed)) {
    return {
      message: (
        <div>
          <p>
            Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)}; at that point, your{' '}
            <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
              enterprise features
            </Link>{' '}
            will become unavailable. To get a full Redpanda Enterprise license,{' '}
            <Link href={getEnterpriseCTALink('upgrade')} rel="noopener noreferrer" target="_blank">
              contact us
            </Link>
            .
          </p>
          <div className="my-2 flex gap-2">
            <UploadLicenseButton />
            <UpgradeButton />
          </div>
        </div>
      ),
      variant: 'destructive',
    };
  }
  return null;
}
function getKafkaFeatureAlert(
  license: License,
  msToExpiration: number
): { message: ReactElement; variant: 'destructive' | 'informative' } | null {
  if (msToExpiration > 15 * MS_IN_DAY && msToExpiration < 30 * MS_IN_DAY) {
    if (license.type === License_Type.TRIAL) {
      return {
        message: (
          <div>
            <p>This is an enterprise feature. Your trial is active until {getPrettyExpirationDate(license)}</p>
            <div className="my-2 flex gap-2">
              <UploadLicenseButton />
              <UpgradeButton />
            </div>
          </div>
        ),
        variant: 'informative',
      };
    }
    return {
      message: (
        <div>
          <p>
            This is a Redpanda Enterprise feature. Try it with our{' '}
            <Link href={getEnterpriseCTALink('tryEnterprise')} rel="noopener noreferrer" target="_blank">
              Redpanda Enterprise Trial
            </Link>
            .
          </p>
        </div>
      ),
      variant: 'informative',
    };
  }
  if (msToExpiration > 0 && msToExpiration < 15 * MS_IN_DAY && license.type === License_Type.TRIAL) {
    return {
      message: (
        <div>
          <p>
            Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)}; at that point, your{' '}
            <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
              enterprise features
            </Link>{' '}
            will become unavailable. To get a full Redpanda Enterprise license,{' '}
            <Link href={getEnterpriseCTALink('upgrade')} rel="noopener noreferrer" target="_blank">
              contact us
            </Link>
            .
          </p>
          <div className="my-2 flex gap-2">
            <UploadLicenseButton />
            <UpgradeButton />
          </div>
        </div>
      ),
      variant: 'destructive',
    };
  }
  return null;
}
/**
 * Treat the trial as baked-in only while all returned licenses are baked-in, and wait for broker distribution before showing a Redpanda license notice.
 */
export const FeatureLicenseNotification: FC<{
  featureName: 'reassignPartitions' | 'rbac';
}> = ({ featureName }) => {
  const [registerModalOpen, setIsRegisterModalOpen] = useState(false);

  useEffect(() => {
    api.refreshClusterOverview().catch(() => {
      // WARNING: The API store owns this refresh failure; do not duplicate the error in the notification.
    });
    api.listLicenses().catch(() => {
      // WARNING: The API store owns license request errors; do not infer an expired license from a failed request.
    });
  }, []);

  const licenses = api.licenses
    .filter((lic) => lic.type === License_Type.TRIAL || lic.type === License_Type.COMMUNITY)
    .sort((a, b) => LICENSE_WEIGHT[a.type] - LICENSE_WEIGHT[b.type]);

  const license = getLatestExpiringLicense(licenses);

  const bakedInTrial = licenses.every((lic) => isBakedInTrial(lic));

  const alertContent = getLicenseAlertContentForFeature(
    featureName,
    license,
    api.enterpriseFeaturesUsed,
    bakedInTrial,
    () => {
      setIsRegisterModalOpen(true);
    }
  );

  if (api.clusterOverview === null || !license || alertContent === null) {
    return null;
  }

  const { message, variant } = alertContent;

  return (
    <>
      <Alert variant={variant}>
        <AlertDescription>{message}</AlertDescription>
      </Alert>

      <RegisterModal isOpen={registerModalOpen} onClose={() => setIsRegisterModalOpen(false)} />
    </>
  );
};
