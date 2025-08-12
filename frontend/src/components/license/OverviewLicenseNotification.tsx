import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { type FC, type ReactElement, useEffect, useState } from 'react';
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
  SERVERLESS_LINK,
  UpgradeButton,
  UploadLicenseButton,
} from './licenseUtils';
import { RegisterModal } from './RegisterModal';

const getLicenseAlertContent = (
  licenses: License[],
  onRegisterModalOpen: () => void,
): { message: ReactElement; status: 'warning' | 'info' } | null => {
  if (licenses.length === 0) {
    return null;
  }

  // Trial is either baked-in or extended. We need to check if any of the licenses are baked-in.
  // We say the trial is baked-in if and only if all the licenses are baked-in. There can be a situation where, 
  // use has registered a license, it's updated in the brokers, but the console doesn't have the license re-loaded yet.
  const bakedInTrial = licenses.every(license => isBakedInTrial(license));
  
  // Choose the license with the latest expiration time
  const license = licenses.reduce((latest, current) => {
    const latestExpiration = Number(latest.expiresAt);
    const currentExpiration = Number(current.expiresAt);
    return currentExpiration > latestExpiration ? current : latest;
  });

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
                <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
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
              This cluster is on an Enterprise trial. Register for an additional 30 days of <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">
                enterprise features
              </Link>.

              <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
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
                This cluster's Enterprise trial will expire in {getPrettyTimeToExpiration(license)}. SSO/RBAC is enabled and Console will be inaccessible after license expiry. Disable SSO/RBAC, or register for an additional 30 days of <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">enterprise features</Link>.

                <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
              </Flex>
              </Box>
            ),
            status: 'warning',
          };
        } else {
          return {
            message: (
              <Box>
                This cluster's Enterprise trial will expire in {getPrettyTimeToExpiration(license)}. Register for an additional 30 days of <Link href={ENTERPRISE_FEATURES_DOCS_LINK} target="_blank">enterprise features</Link>.

                <Flex gap={2} my={2}>
                <UploadLicenseButton />
                <RegisterButton onRegisterModalOpen={onRegisterModalOpen} />
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
              This Extended Enterprise trial has expired. The fastest way to continue is with <Link href={SERVERLESS_LINK} target="_blank">Redpanda Serverless</Link>.
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
              This cluster is on an Extended Enterprise trial. When your trial expires, the fastest way to continue is with <Link href={SERVERLESS_LINK} target="_blank">Redpanda Serverless</Link>.
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
                This Extended Enterprise trial expires in {getPrettyTimeToExpiration(license)}. Enterprise features like SSO/RBAC will be unavailable after the trial expires. When your trial expires, the fastest way to continue is with <Link href={SERVERLESS_LINK} target="_blank">Redpanda Serverless</Link>.
                <Flex gap={2} my={2}>
                  <UploadLicenseButton />
                </Flex>
              </Box>
            ),
            status: 'warning',
          };
        } else {
          return {
            message: (
              <Box>
                This Extended Enterprise trial expires in {getPrettyTimeToExpiration(license)}. When your trial expires, the fastest way to continue is with <Link href={SERVERLESS_LINK} target="_blank">Redpanda Serverless</Link>.
                <Flex gap={2} my={2}>
                  <UploadLicenseButton />
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
  const [registerModalOpen, setIsRegisterModalOpen] = useState(false);

  useEffect(() => {
    void api.refreshClusterOverview();
    void api.listLicenses();
  }, []);

  const trialLicenses = api.licenses.filter((license) => license.type === License_Type.TRIAL);

  const alertContent = getLicenseAlertContent(trialLicenses, () => {
    setIsRegisterModalOpen(true);
  });

  // This component needs info about whether we're using Redpanda or Kafka, without fetching clusterOverview first, we might get a malformed result
  if (api.clusterOverview === null) {
    return null;
  }

  if (trialLicenses.length === 0) {
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
});
