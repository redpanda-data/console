import { Alert, AlertDescription, AlertIcon, Box, Flex, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { type FC, type ReactElement, useEffect } from 'react';
import {
  type License,
  License_Type,
  type ListEnterpriseFeaturesResponse_Feature,
} from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backendApi';
import {
  ENTERPRISE_FEATURES_DOCS_LINK,
  LICENSE_WEIGHT,
  MS_IN_DAY,
  UpgradeButton,
  UploadLicenseButton,
  coreHasEnterpriseFeatures,
  getEnterpriseCTALink,
  getMillisecondsToExpiration,
  getPrettyExpirationDate,
  getPrettyTimeToExpiration,
} from './licenseUtils';

const getLicenseAlertContentForFeature = (
  _featureName: 'rbac' | 'reassignPartitions',
  license: License | undefined,
  enterpriseFeaturesUsed: ListEnterpriseFeaturesResponse_Feature[],
): { message: ReactElement; status: 'warning' | 'info' } | null => {
  if (license === undefined || license.type !== License_Type.TRIAL) {
    return null;
  }

  const msToExpiration = getMillisecondsToExpiration(license);

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
              <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">
                enterprise features
              </Link>{' '}
              will become unavailable. To get a full Redpanda Enterprise license,{' '}
              <Link href={getEnterpriseCTALink('upgrade')} target="_blank">
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
              <Link href={getEnterpriseCTALink('tryEnterprise')} target="_blank">
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
              <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">
                enterprise features
              </Link>{' '}
              will become unavailable. To get a full Redpanda Enterprise license,{' '}
              <Link href={getEnterpriseCTALink('upgrade')} target="_blank">
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
    useEffect(() => {
      void api.refreshClusterOverview();
      void api.listLicenses();
    }, []);

    const license = api.licenses
      .filter((license) => license.type === License_Type.TRIAL || license.type === License_Type.COMMUNITY)
      .sort((a, b) => LICENSE_WEIGHT[a.type] - LICENSE_WEIGHT[b.type]) // Sort by priority
      .first();

    const enterpriseFeaturesUsed = api.enterpriseFeaturesUsed;
    const alertContent = getLicenseAlertContentForFeature(featureName, license, enterpriseFeaturesUsed);

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
      </Box>
    );
  },
);
