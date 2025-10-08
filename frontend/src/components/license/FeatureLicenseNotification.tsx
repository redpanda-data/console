import { Alert, AlertDescription, AlertIcon, Box, Flex, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
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
} from './licenseUtils';

const WARNING_THRESHOLD_DAYS = 5;

import { RegisterModal } from './RegisterModal';
import {
  type License,
  License_Type,
  type ListEnterpriseFeaturesResponse_Feature,
} from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backendApi';

// biome-ignore lint/nursery/useMaxParams: Refactoring to options object would require updating all call sites
const getLicenseAlertContentForFeature = (
  _featureName: 'rbac' | 'reassignPartitions',
  license: License | undefined,
  enterpriseFeaturesUsed: ListEnterpriseFeaturesResponse_Feature[],
  bakedInTrial: boolean,
  onRegisterModalOpen: () => void
): { message: ReactElement; status: 'warning' | 'info' } | null => {
  if (license === undefined) {
    return null;
  }

  const msToExpiration = getMillisecondsToExpiration(license);

  if (license.type === License_Type.TRIAL && api.isRedpanda) {
    if (bakedInTrial) {
      return {
        message: (
          <Box>
            <Text>This is an enterprise feature. Register for an additional 30 days of enterprise features.</Text>
            <Flex gap={2} my={2}>
              <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
            </Flex>
          </Box>
        ),
        status: msToExpiration > WARNING_THRESHOLD_DAYS * MS_IN_DAY ? 'info' : 'warning',
      };
    }
    return {
      message: (
        <Box>
          <Text>This is an enterprise feature.</Text>
        </Box>
      ),
      status: msToExpiration > WARNING_THRESHOLD_DAYS * MS_IN_DAY ? 'info' : 'warning',
    };
  }

  // Redpanda
  if (api.isRedpanda) {
    if (
      msToExpiration > 15 * MS_IN_DAY &&
      msToExpiration < 30 * MS_IN_DAY &&
      coreHasEnterpriseFeatures(enterpriseFeaturesUsed)
    ) {
      return {
        message: (
          <Box>
            <Text>This is an enterprise feature, active until {getPrettyExpirationDate(license)}.</Text>
            <Flex gap={2} my={2}>
              <UploadLicenseButton />
              <UpgradeButton />
            </Flex>
          </Box>
        ),
        status: 'info',
      };
    }
    if (msToExpiration > -1 && msToExpiration < 15 * MS_IN_DAY && coreHasEnterpriseFeatures(enterpriseFeaturesUsed)) {
      return {
        message: (
          <Box>
            <Text>
              Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)}; at that point, your{' '}
              <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
                enterprise features
              </Link>{' '}
              will become unavailable. To get a full Redpanda Enterprise license,{' '}
              <Link href={getEnterpriseCTALink('upgrade')} rel="noopener noreferrer" target="_blank">
                contact us
              </Link>
              .
            </Text>
            <Flex gap={2} my={2}>
              <UploadLicenseButton />
              <UpgradeButton />
            </Flex>
          </Box>
        ),
        status: 'warning',
      };
    }
  } else {
    // Kafka
    if (msToExpiration > 15 * MS_IN_DAY && msToExpiration < 30 * MS_IN_DAY) {
      if (license.type === License_Type.TRIAL) {
        return {
          message: (
            <Box>
              <Text>This is an enterprise feature. Your trial is active until {getPrettyExpirationDate(license)}</Text>
              <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <UpgradeButton />
              </Flex>
            </Box>
          ),
          status: 'info',
        };
      }
      return {
        message: (
          <Box>
            <Text>
              This is a Redpanda Enterprise feature. Try it with our{' '}
              <Link href={getEnterpriseCTALink('tryEnterprise')} rel="noopener noreferrer" target="_blank">
                Redpanda Enterprise Trial
              </Link>
              .
            </Text>
          </Box>
        ),
        status: 'info',
      };
    }
    if (msToExpiration > 0 && msToExpiration < 15 * MS_IN_DAY && license.type === License_Type.TRIAL) {
      return {
        message: (
          <Box>
            <Text>
              Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)}; at that point, your{' '}
              <Link href={ENTERPRISE_FEATURES_DOCS_LINK} rel="noopener noreferrer" target="_blank">
                enterprise features
              </Link>{' '}
              will become unavailable. To get a full Redpanda Enterprise license,{' '}
              <Link href={getEnterpriseCTALink('upgrade')} rel="noopener noreferrer" target="_blank">
                contact us
              </Link>
              .
            </Text>
            <Flex gap={2} my={2}>
              <UploadLicenseButton />
              <UpgradeButton />
            </Flex>
          </Box>
        ),
        status: 'warning',
      };
    }
  }

  return null;
};

export const FeatureLicenseNotification: FC<{ featureName: 'reassignPartitions' | 'rbac' }> = observer(
  ({ featureName }) => {
    const [registerModalOpen, setIsRegisterModalOpen] = useState(false);

    useEffect(() => {
      api.refreshClusterOverview().catch(() => {
        // Error handling managed by API layer
      });
      api.listLicenses().catch(() => {
        // Error handling managed by API layer
      });
    }, []);

    const licenses = api.licenses
      .filter((license) => license.type === License_Type.TRIAL || license.type === License_Type.COMMUNITY)
      .sort((a, b) => LICENSE_WEIGHT[a.type] - LICENSE_WEIGHT[b.type]); // Sort by priority

    // Choose the license with the latest expiration time
    const license = getLatestExpiringLicense(licenses);

    // Trial is either baked-in or extended. We need to check if any of the licenses are baked-in.
    // We say the trial is baked-in if and only if all the licenses are baked-in. There can be a situation where,
    // use has registered a license, it's updated in the brokers, but the console doesn't have the license re-loaded yet.
    const bakedInTrial = licenses.every((license) => isBakedInTrial(license));

    const enterpriseFeaturesUsed = api.enterpriseFeaturesUsed;
    const alertContent = getLicenseAlertContentForFeature(
      featureName,
      license,
      enterpriseFeaturesUsed,
      bakedInTrial,
      () => {
        setIsRegisterModalOpen(true);
      }
    );

    // This component needs info about whether we're using Redpanda or Kafka, without fetching clusterOverview first, we might get a malformed result
    if (api.clusterOverview === null) {
      return null;
    }

    if (!license) {
      return null;
    }

    if (alertContent === null) {
      return null;
    }

    const { message, status } = alertContent;

    return (
      <Box>
        <Alert mb={4} status={status} variant="subtle">
          <AlertIcon />
          <AlertDescription>{message}</AlertDescription>
        </Alert>

        <RegisterModal isOpen={registerModalOpen} onClose={() => setIsRegisterModalOpen(false)} />
      </Box>
    );
  }
);
