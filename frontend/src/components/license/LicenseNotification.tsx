import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { api } from '../../state/backendApi';
import { getPrettyTimeToExpiration, licenseIsExpired, licenseSoonToExpire, prettyLicenseType } from './licenseUtils';
import { Link as ReactRouterLink, useLocation } from 'react-router-dom';
import { License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';

export const LicenseNotification = observer(() => {
    const location = useLocation();

    // This Global License Notification banner is used only for Enterprise licenses
    // Trial Licences are handled by OverviewLicenseNotification and FeatureLicenseNotification.
    // Community Licenses can't expire at all.
    const enterpriseLicenses = api.licenses.filter(license => license.type === License_Type.ENTERPRISE)

    const visibleExpiredEnterpriseLicenses = enterpriseLicenses.filter(licenseIsExpired) ?? [];
    const soonToExpireLicenses = enterpriseLicenses
            .filter(license => licenseSoonToExpire(license))
        ?? [];

    const showSomeLicenseExpirationInfo = visibleExpiredEnterpriseLicenses.length || soonToExpireLicenses.length;
    const showEnterpriseFeaturesWarning = api.licenseViolation;

    if (api.licensesLoaded === undefined) {
        return null;
    }

    // For these paths, we don't need to show a notification banner because the pages themselves handle license management
    if (location.pathname === '/admin/upload-license' || location.pathname === '/trial-expired') {
        return null;
    }

    if (!showSomeLicenseExpirationInfo && !showEnterpriseFeaturesWarning) {
        return null;
    }

    const activeEnterpriseFeatures = api.enterpriseFeaturesUsed.filter(x => x.enabled)

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

                    {visibleExpiredEnterpriseLicenses.length > 0 && <Box>
                        {visibleExpiredEnterpriseLicenses.map((license, idx) =>
                            <Text key={idx}>Your {prettyLicenseType(license, true)} license has expired.</Text>
                        )}
                    </Box>}

                    {showEnterpriseFeaturesWarning && <Text>
                        You're using {activeEnterpriseFeatures.length === 1 ? 'an enterprise feature' : 'enterprise features'} <strong>{activeEnterpriseFeatures.map(x => x.name).join(', ')}</strong> in your connected Redpanda cluster. {activeEnterpriseFeatures.length === 1 ? 'This feature requires a license' : 'These features require a license'}.
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
