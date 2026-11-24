import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Link } from 'components/redpanda-ui/components/typography';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { type FC, type ReactElement, useEffect, useState } from 'react';

import {
  consoleHasEnterpriseFeature,
  coreHasActiveEnterpriseLicense,
  DISABLE_SSO_DOCS_LINK,
  ENTERPRISE_FEATURES_DOCS_LINK,
  getEnterpriseCTALink,
  getLatestExpiringLicense,
  getMillisecondsToExpiration,
  getPrettyTimeToExpiration,
  isBakedInTrial,
  MS_IN_DAY,
  RegisterButton,
  SERVERLESS_LINK,
  UpgradeButton,
  UploadLicenseButton,
} from './license-utils';
import { RegisterModal } from './register-modal';
import { type License, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api, useApiStoreHook } from '../../state/backend-api';

type OverviewLicenseAlert = { message: ReactElement; status: 'warning' | 'informative' };

const getLicenseAlertContent: (licenses: License[], onRegisterModalOpen: () => void) => OverviewLicenseAlert | null = (
  licenses,
  onRegisterModalOpen
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
) => {
  if (licenses.length === 0) {
    return null;
  }

  const bakedInTrial = licenses.every((lic) => isBakedInTrial(lic));

  const license = getLatestExpiringLicense(licenses);

  if (!license) {
    return null;
  }

  const msToExpiration = getMillisecondsToExpiration(license);

  return api.isRedpanda
    ? bakedInTrial
      ? getBakedTrialAlert(license, msToExpiration, onRegisterModalOpen)
      : getExtendedTrialAlert(license, msToExpiration)
    : getKafkaTrialAlert(license, msToExpiration);
};

function getBakedTrialAlert(license: License, msToExpiration: number, onRegisterModalOpen: () => void) {
  if (msToExpiration < 0) {
    return {
      message: (
        <div>
          This cluster's Enterprise Trial has expired. Register for an additional 30 days of{' '}
          <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
            enterprise features
          </Link>
          .
          <div className="my-2 flex gap-2">
            <UploadLicenseButton />
            <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
          </div>
        </div>
      ),
      status: 'warning',
    } satisfies OverviewLicenseAlert;
  }

  const WARNING_THRESHOLD_DAYS = 5;
  if (msToExpiration > WARNING_THRESHOLD_DAYS * MS_IN_DAY) {
    return {
      message: (
        <div>
          This cluster is on an Enterprise trial. Register for an additional 30 days of{' '}
          <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
            enterprise features
          </Link>
          .
          <div className="my-2 flex gap-2">
            <UploadLicenseButton />
            <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
          </div>
        </div>
      ),
      status: 'informative',
    } satisfies OverviewLicenseAlert;
  }

  if (consoleHasEnterpriseFeature('SINGLE_SIGN_ON')) {
    return {
      message: (
        <div>
          This cluster's Enterprise trial will expire in {getPrettyTimeToExpiration(license)}. SSO/RBAC is enabled and
          Console will be inaccessible after license expiry. Disable SSO/RBAC, or register for an additional 30 days of{' '}
          <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
            enterprise features
          </Link>
          .
          <div className="my-2 flex gap-2">
            <UploadLicenseButton />
            <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
          </div>
        </div>
      ),
      status: 'warning',
    } satisfies OverviewLicenseAlert;
  }
  return {
    message: (
      <div>
        This cluster's Enterprise trial will expire in {getPrettyTimeToExpiration(license)}. Register for an additional
        30 days of{' '}
        <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
          enterprise features
        </Link>
        .
        <div className="my-2 flex gap-2">
          <UploadLicenseButton />
          <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
        </div>
      </div>
    ),
    status: 'warning',
  } satisfies OverviewLicenseAlert;
}
function getExtendedTrialAlert(license: License, msToExpiration: number) {
  if (msToExpiration < 0) {
    return {
      message: (
        <div>
          This Extended Enterprise trial has expired. The fastest way to continue is with{' '}
          <Link href={SERVERLESS_LINK} rel="noopener noreferrer" target="_blank">
            Redpanda Serverless
          </Link>
          .
        </div>
      ),
      status: 'warning',
    } satisfies OverviewLicenseAlert;
  }

  const WARNING_THRESHOLD_DAYS = 5;
  if (msToExpiration > WARNING_THRESHOLD_DAYS * MS_IN_DAY) {
    return {
      message: (
        <div>
          This cluster is on an Extended Enterprise trial. When your trial expires, the fastest way to continue is with{' '}
          <Link href={SERVERLESS_LINK} rel="noopener noreferrer" target="_blank">
            Redpanda Serverless
          </Link>
          .
        </div>
      ),
      status: 'informative',
    } satisfies OverviewLicenseAlert;
  }

  if (consoleHasEnterpriseFeature('SINGLE_SIGN_ON')) {
    return {
      message: (
        <div>
          This Extended Enterprise trial expires in {getPrettyTimeToExpiration(license)}. Enterprise features like
          SSO/RBAC will be unavailable after the trial expires. When your trial expires, the fastest way to continue is
          with{' '}
          <Link href={SERVERLESS_LINK} rel="noopener noreferrer" target="_blank">
            Redpanda Serverless
          </Link>
          .
          <div className="my-2 flex gap-2">
            <UploadLicenseButton />
          </div>
        </div>
      ),
      status: 'warning',
    } satisfies OverviewLicenseAlert;
  }
  return {
    message: (
      <div>
        This Extended Enterprise trial expires in {getPrettyTimeToExpiration(license)}. When your trial expires, the
        fastest way to continue is with{' '}
        <Link href={SERVERLESS_LINK} rel="noopener noreferrer" target="_blank">
          Redpanda Serverless
        </Link>
        .
        <div className="my-2 flex gap-2">
          <UploadLicenseButton />
        </div>
      </div>
    ),
    status: 'warning',
  } satisfies OverviewLicenseAlert;
}
function getKafkaTrialAlert(license: License, msToExpiration: number) {
  if (msToExpiration > 0 && msToExpiration < 15 * MS_IN_DAY) {
    if (consoleHasEnterpriseFeature('SINGLE_SIGN_ON')) {
      return {
        message: (
          <div>
            <p className="text-body">
              Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)} and Console SSO/RBAC is
              enabled. As a result, Console will be inaccessible after license expiry. To prevent this,{' '}
              <Link href={DISABLE_SSO_DOCS_LINK} rel="noopener noreferrer" target="_blank">
                disable
              </Link>{' '}
              SSO and RBAC, or get a{' '}
              <Link href={getEnterpriseCTALink('upgrade')} rel="noopener noreferrer" target="_blank">
                full Redpanda Enterprise license
              </Link>
              .
            </p>
            <div className="my-2 flex gap-2">
              <UploadLicenseButton />
              <UpgradeButton />
            </div>
          </div>
        ),
        status: 'warning',
      } satisfies OverviewLicenseAlert;
    }
    return {
      message: (
        <div>
          <p className="text-body">
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
      status: 'warning',
    } satisfies OverviewLicenseAlert;
  }

  return null;
}
export const OverviewLicenseNotification: FC = () => {
  const licenses = useApiStoreHook((s) => s.licenses);
  const clusterOverview = useApiStoreHook((s) => s.clusterOverview);
  const [registerModalOpen, setIsRegisterModalOpen] = useState(false);

  useEffect(() => {
    api.refreshClusterOverview().catch(() => {});
    api.listLicenses().catch(() => {});
  }, []);

  const trialLicenses = licenses.filter((license) => license.type === License_Type.TRIAL);

  const alertContent = getLicenseAlertContent(trialLicenses, () => {
    setIsRegisterModalOpen(true);
  });

  if (
    clusterOverview === null ||
    trialLicenses.length === 0 ||
    coreHasActiveEnterpriseLicense(licenses) ||
    alertContent === null
  ) {
    return null;
  }

  const { message, status } = alertContent;

  return (
    <div>
      <Alert className="mb-4" icon={status === 'warning' ? <TriangleAlertIcon /> : <InfoIcon />} variant={status}>
        <AlertDescription>{message}</AlertDescription>
      </Alert>

      <RegisterModal isOpen={registerModalOpen} onClose={() => setIsRegisterModalOpen(false)} />
    </div>
  );
};
