import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink } from 'react-router-dom';
import { FC, ReactElement, useEffect } from 'react';
import { License, License_Type, ListEnterpriseFeaturesResponse_Feature } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { getEnterpriseCTALink, getMillisecondsToExpiration, getPrettyEnterpriseFeatures, getPrettyTimeToExpiration, MS_IN_DAY, usesAuthEnterpriseFeatures } from './licenseUtils';
import { api } from '../../state/backendApi';
import { config as appConfig } from '../../config';

const UploadLicenseButton = () => api.isAdminApiConfigured ? <Button variant="outline" size="sm" as={ReactRouterLink} to="/admin/upload-license">Upload license</Button> : null


const getLicenseAlertContent = (license: License | undefined, enterpriseFeaturesUsed: ListEnterpriseFeaturesResponse_Feature[]): { message: ReactElement, status: 'warning' | 'info' } | null  => {
    if (license === undefined || license.type !== License_Type.TRIAL) {
        return null
    }

    const msToExpiration = getMillisecondsToExpiration(license);

    // Redpanda
    if (api.isRedpanda) {
        if (msToExpiration > 15 * MS_IN_DAY && msToExpiration < 30 * MS_IN_DAY) {
            return {
                message: <Box>Your Redpanda Enterprise trial will expire in {getPrettyTimeToExpiration(license)}. <Link href={getEnterpriseCTALink('upgrade')} target="_blank">Contact us</Link> to get a full Enterprise license.</Box>,
                status: 'info',
            }
        } else if (msToExpiration > 0 && msToExpiration < 15 * MS_IN_DAY) {
            if (usesAuthEnterpriseFeatures(enterpriseFeaturesUsed)) {
                return {
                    message: <Box>
                        <Text>
                            Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)} and Console {getPrettyEnterpriseFeatures(enterpriseFeaturesUsed)} is enabled. As a result, Console will be inaccessible after license expiry. To prevent this, disable {getPrettyEnterpriseFeatures(enterpriseFeaturesUsed)}, or get a <Link href={getEnterpriseCTALink('upgrade')} target="_blank">full Redpanda Enterprise license</Link>.
                        </Text>
                        <Flex gap={2} my={2}>
                            <UploadLicenseButton/>
                        </Flex>
                    </Box>,
                    status: 'warning'
                };
            } else {
                return {
                    message: <Box>
                        <Text>
                            Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)}; at that point, your enterprise features will become unavailable. To get a full Redpanda Enterprise license, <Link href={getEnterpriseCTALink('upgrade')} target="_blank">contact us</Link>.
                        </Text>
                        <Flex gap={2} my={2}>
                            <UploadLicenseButton/>
                        </Flex>
                    </Box>,
                    status: 'warning'
                };
            }
        }
    } else {
        // Kafka
        if (msToExpiration > 0 && msToExpiration < 15 * MS_IN_DAY) {
            if (usesAuthEnterpriseFeatures(enterpriseFeaturesUsed)) {
                return {
                    message: <Box>
                        <Text>
                            Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)} and Console {getPrettyEnterpriseFeatures(enterpriseFeaturesUsed)} is enabled. As a result, Console will be inaccessible after license expiry. To prevent this, disable {getPrettyEnterpriseFeatures(enterpriseFeaturesUsed)}, or get a <Link href={getEnterpriseCTALink('upgrade')} target="_blank">full Redpanda Enterprise license</Link>.
                        </Text>
                        <Flex gap={2} my={2}>
                            <UploadLicenseButton/>
                        </Flex>
                    </Box>,
                    status: 'warning'
                };
            } else {
                return {
                    message:
                        <Box>
                            <Text>
                                Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)}; at that point, your enterprise features will become unavailable. To get a full Redpanda Enterprise license, <Link href={getEnterpriseCTALink('upgrade')} target="_blank">contact us</Link>.
                            </Text>
                            <Flex gap={2} my={2}>
                                <UploadLicenseButton/>
                            </Flex>
                        </Box>,
                    status: 'warning'
                };
            }
        }
    }

    return null;
};

export const OverviewLicenseNotification: FC = observer(() => {
    useEffect(() => {
        void api.refreshClusterOverview()
        void api.listLicenses();
    }, []);

    const license = api.licenses.filter(license => license.type === License_Type.TRIAL).first();
    const enterpriseFeaturesUsed = api.enterpriseFeaturesUsed
    const alertContent = getLicenseAlertContent(license, enterpriseFeaturesUsed);

    // This component needs info about whether we're using Redpanda or Kafka, without fetching clusterOverview first, we might get a malformed result
    if (api.clusterOverview === null) {
        return null
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
            <Alert
                mb={4}
                status={status}
                variant="subtle"
            >
                <AlertIcon/>
                <AlertDescription>
                    {message}
                </AlertDescription>
            </Alert>
        </Box>
    );
});
