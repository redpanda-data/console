import { Alert, AlertDescription, AlertIcon, Box, Flex, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { type FC, type ReactElement, useEffect } from 'react';
import { type License, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backendApi';
import {
  DISABLE_SSO_DOCS_LINK,
  ENTERPRISE_FEATURES_DOCS_LINK,
  MS_IN_DAY,
  UpgradeButton,
  UploadLicenseButton,
  consoleHasEnterpriseFeature,
  getEnterpriseCTALink,
  getMillisecondsToExpiration,
  getPrettyTimeToExpiration,
} from './licenseUtils';

const getLicenseAlertContent = (
  license: License | undefined,
): { message: ReactElement; status: 'warning' | 'info' } | null => {
  if (license === undefined || license.type !== License_Type.TRIAL) {
    return null;
  }

  const msToExpiration = getMillisecondsToExpiration(license);

  // Redpanda
  if (api.isRedpanda) {
    if (msToExpiration > 15 * MS_IN_DAY && msToExpiration < 30 * MS_IN_DAY) {
      return {
        message: (
          <Box>
            Your Redpanda Enterprise trial will expire in {getPrettyTimeToExpiration(license)}.{' '}
            <Link href={getEnterpriseCTALink('upgrade')} target="_blank">
              Request a full license
            </Link>
            .
          </Box>
        ),
        status: 'info',
      };
    }
    if (msToExpiration > -1 && msToExpiration < 15 * MS_IN_DAY) {
      if (consoleHasEnterpriseFeature('SINGLE_SIGN_ON')) {
        return {
          message: (
            <Box>
              <Text>
                Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)} and Console SSO/RBAC
                is enabled. As a result, Console will be inaccessible after license expiry. To prevent this,{' '}
                <Link href={DISABLE_SSO_DOCS_LINK} target="_blank">
                  disable
                </Link>{' '}
                SSO and RBAC, or get a{' '}
                <Link href={getEnterpriseCTALink('upgrade')} target="_blank">
                  full Redpanda Enterprise license
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
    if (msToExpiration > 0 && msToExpiration < 15 * MS_IN_DAY) {
      if (consoleHasEnterpriseFeature('SINGLE_SIGN_ON')) {
        return {
          message: (
            <Box>
              <Text>
                Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)} and Console SSO/RBAC
                is enabled. As a result, Console will be inaccessible after license expiry. To prevent this,{' '}
                <Link href={DISABLE_SSO_DOCS_LINK} target="_blank">
                  disable
                </Link>{' '}
                SSO and RBAC, or get a{' '}
                <Link href={getEnterpriseCTALink('upgrade')} target="_blank">
                  full Redpanda Enterprise license
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

export const OverviewLicenseNotification: FC = observer(() => {
  useEffect(() => {
    void api.refreshClusterOverview();
    void api.listLicenses();
  }, []);

  const license = api.licenses.filter((license) => license.type === License_Type.TRIAL).first();
  const alertContent = getLicenseAlertContent(license);

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
});
