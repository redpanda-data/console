import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { api } from '../../state/backendApi';
import { getPrettyTimeToExpiration, licenseCanExpire, licenseIsExpired, licenseSoonToExpire, prettyLicenseType } from './licenseUtils';
import { Link as ReactRouterLink, useLocation } from 'react-router-dom';
import { License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';

export const LicenseNotification = observer(() => {
    const location = useLocation();
    const expiredLicenses = api.licenses.filter(licenseIsExpired) ?? [];
    const soonToExpireLicenses = api.licenses
            .filter(licenseSoonToExpire)
            .filter(licenseCanExpire)
        ?? [];

    const showSomeLicenseExpirationInfo = expiredLicenses.length || soonToExpireLicenses.length;
    // TODO - will be provided by API
    const enterpriseFeaturesUsed = false;
    const showEnterpriseFeaturesWarning = enterpriseFeaturesUsed && !api.licenses.some(license => license.type === License_Type.ENTERPRISE || license.type === License_Type.TRIAL);

    if (!api.licensesLoaded) {
        return null;
    }

    if (location.pathname === '/admin/upload-license') {
        return null;
    }

    if (!showSomeLicenseExpirationInfo && !showEnterpriseFeaturesWarning) {
        return null;
    }

    return (
        <Box>
            <Alert
                mb={4}
                status="warning"
                variant="subtle"
            >
                <AlertIcon/>
                <AlertDescription>
                    {soonToExpireLicenses.length > 0 && <Box>
                        {soonToExpireLicenses.map((license, idx) =>
                            <Text key={idx}>Your {prettyLicenseType(license, true)} license is expiring in {getPrettyTimeToExpiration(license)}.</Text>
                        )}
                    </Box>}

                    {expiredLicenses.length > 0 && <Box>
                        {expiredLicenses.map((license, idx) =>
                            <Text key={idx}>Your {prettyLicenseType(license, true)} license has expired.</Text>
                        )}
                    </Box>}

                    {showEnterpriseFeaturesWarning && <Text>
                        You're using Enterprise features in your connected Redpanda cluster. These features require a license.
                    </Text>}

                    <Flex gap={2} my={2}>
                        {api.isAdminApiConfigured && <Button variant="outline" size="sm" as={ReactRouterLink} to="/admin/upload-license">Upload license</Button>}
                        {soonToExpireLicenses.length > 0 && <Button variant="outline" size="sm" as="a" target="_blank" href="https://redpanda.com/license-request">Renew license</Button>}
                        {showEnterpriseFeaturesWarning && <Button variant="outline" size="sm" as="a" target="_blank" href="https://www.redpanda.com/try-redpanda">Request a trial</Button>}
                    </Flex>
                </AlertDescription>
            </Alert>
        </Box>
    );
});
