import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { type FC, type ReactElement, useEffect } from 'react';
import { type License, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backendApi';
import {
  consoleHasEnterpriseFeature,
  DISABLE_SSO_DOCS_LINK,
  ENTERPRISE_FEATURES_DOCS_LINK,
  getEnterpriseCTALink,
  getMillisecondsToExpiration,
  getPrettyTimeToExpiration,
  isBakedInTrial,
  MS_IN_DAY,
  RegisterButton,
  UpgradeButton,
  UploadLicenseButton,
} from './licenseUtils';

const getLicenseAlertContent = (
  license: License | undefined,
): { message: ReactElement; status: 'warning' | 'info' } | null => {
  if (license === undefined || license.type !== License_Type.TRIAL) {
    return null;
  }

  // Trial is either baked-in or extended.
  const bakedInTrial = isBakedInTrial(license);

  const msToExpiration = getMillisecondsToExpiration(license);

  // Redpanda
  if (api.isRedpanda) {
    if (bakedInTrial) {

      // Trial is baked-in and has expired
      if (msToExpiration < 0) {
        return {
          message: (
            <Box>
              This cluster's Enterprise Trial has expired. Register for an additional 30 days of <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">
                enterprise features
              </Link>.

              <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>
            </Box>
          ),
          status: 'warning',
        };
      }

      // Trial is baked-in and has > 5 days left
      if (msToExpiration > 5 * MS_IN_DAY) {
        return {
          message: (
            <Box>
              This cluster is on an Enterprise Trial. Register for an additional 30 days of <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">
                enterprise features
              </Link>.

              <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>
            </Box>
          ),
          status: 'info',
        };
      } else {
        // Trial is baked-in and has < 5 days left

        if (consoleHasEnterpriseFeature('SINGLE_SIGN_ON')) {
          return {
            message: (
              <Box>
                This cluster's Enterprise trial will expire in {getPrettyTimeToExpiration(license)}. SSO/RBAC is enabled and Console will be inaccessible after license expiry. Disable SSO/RBAC, or register for an additional 30 days of enterprise features.

                <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>
              </Box>
            ),
            status: 'warning',
          };
        } else {
          return {
            message: (
              <Box>
                This cluster's Enterprise Trial will expire in {getPrettyTimeToExpiration(license)}. Register for an additional 30 days of enterprise features

                <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>
              </Box>
            ),
            status: 'warning',
          };
        }

      }
    } else {
      // Trial is extended

      if (msToExpiration < 0) {
        return {
          message: (
            <Box>
              This cluster's Extended Enterprise Trial has expired. Try Redpanda Serverless, the fastest way to access advanced features. 
              <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>

            </Box>
          ),
          status: 'warning',
        };
      }

      // Trial is baked-in and has > 5 days left
      if (msToExpiration > 5 * MS_IN_DAY) {
        return {
          message: (
            <Box>
              This cluster is on an Extended Enterprise Trial. Try Redpanda Serverless, the fastest way to access advanced features. 

              <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>
            </Box>
          ),
          status: 'info',
        };
      } else {
        // Trial is baked-in and has < 5 days left

        if (consoleHasEnterpriseFeature('SINGLE_SIGN_ON')) {
          return {
            message: (
              <Box>
                This cluster's Extended Enterprise trial will expire in {getPrettyTimeToExpiration(license)}. SSO/RBAC is enabled and Console will be inaccessible after license expiry. Disable SSO/RBAC, or try Redpanda Serverless, the fastest way to access advanced features.

                <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>
              </Box>
            ),
            status: 'warning',
          };
        } else {
          return {
            message: (
              <Box>
                This cluster's Extended Enterprise Trial will expire in {getPrettyTimeToExpiration(license)}. Try Redpanda Serverless, the fastest way to access advanced features. 

                <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton />
              </Flex>
              </Box>
            ),
            status: 'warning',
          };
        }

      }
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
