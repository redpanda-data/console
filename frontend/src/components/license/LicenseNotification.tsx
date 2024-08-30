import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Link, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { api } from '../../state/backendApi';
import { prettyMilliseconds } from '../../utils/utils';
import { licenseIsExpired, licenseSoonToExpire } from './licenseUtils';
import { Link as ReactRouterLink, useLocation } from 'react-router-dom';

export const LicenseNotification = observer(() => {
    const location = useLocation();
    const expiredLicenses = api.licenses.filter(licenseIsExpired) ?? [];
    const soonToExpireLicenses = api.licenses.filter(licenseSoonToExpire) ?? [];
    // TODO - will be provided by API
    const showEnterpriseFeaturesWarning = true;

    if (location.pathname==='/admin/upload-license') {
        return null;
    }

    if (!expiredLicenses.length && !soonToExpireLicenses.length && !showEnterpriseFeaturesWarning) {
        return null;
    }

    // if(true)
    return (
        <Box>
            <Alert
                mb={4}
                status="warning"
                variant="subtle"
            >
                <AlertIcon/>
                <AlertDescription>
                    {showEnterpriseFeaturesWarning && <Box>
                        <Text>You're using Enterprise features in your connected Redpanda cluster. These features require a license.</Text>
                        <Flex gap={2} my={2}>
                            <Button variant="outline" size="sm" as={ReactRouterLink} to="/admin/upload-license">Upload license</Button>
                            <Button variant="outline" size="sm">Request a trial</Button>
                        </Flex>
                    </Box>}

                    <Box>
                        {/*{JSON.stringify({*/}
                        {/*    expiredLicenses,*/}
                        {/*    soonToExpireLicenses*/}
                        {/*})}*/}
                        {/*{api.licenses.map((license, idx) => {*/}
                        {/*    return <Text key={idx}>{new Date(Number(license.expiresAt) * 1000).toLocaleDateString()}</Text>;*/}
                        {/*})}*/}
                        {/*To use any of our Enterprise features, you need to request a license.*/}
                    </Box>
                </AlertDescription>
            </Alert>
        </Box>
    );

    const unixNow = new Date().getTime() / 1000;
    const sourceNames: { [key in string]: string } = {
        'console': 'Console',
        'cluster': 'Cluster',
    };
    const typeNames: { [key in string]: string } = {
        'free_trial': 'Free Trial',
        'open_source': 'Open Source',
        'enterprise': 'Enterprise',
    };

    const withRemainingTime = api.licenses.map(x => {
        const remainingSec = Number(x.expiresAt) - unixNow;
        const remainingDays = remainingSec / (60 * 60 * 24);

        const expiredForMoreThanAYear = (remainingSec < 0 && remainingDays < -365);
        const prettyDuration = expiredForMoreThanAYear
            ? 'over a year'
            :prettyMilliseconds(Math.abs(remainingSec) * 1000, {unitCount: 2, verbose: true, secondsDecimalDigits: 0});

        return {
            ...x,
            remainingSec,
            remainingDays,
            isExpiringSoon: remainingDays < 30,
            isExpired: remainingSec <= 0,
            sourceDisplayName: sourceNames[x.source] ?? x.source,
            typeDisplayName: typeNames[x.type] ?? x.type,
            prettyDuration,
            prettyDateTime: new Date(Number(x.expiresAt) * 1000).toLocaleDateString(),
        };
    });

    const warnings = withRemainingTime; //.filter(x => x.isExpiringSoon || x.isExpired);
    if (!warnings.length) {
        return null;
    }

    return <Box>
        {warnings.map(e => <Alert key={e.source} status="warning" mb={4}>
                <AlertIcon/>
                <Flex flexDirection="column">
                    <Box>
                        Your Redpanda Enterprise license (<Text textTransform="capitalize" display="inline">{e.sourceDisplayName}</Text>)
                        {e.isExpired
                            ? <> has expired <span>{e.prettyDateTime}</span> ({e.prettyDuration} ago)</>
                            :<> will expire <span>{e.prettyDateTime}</span> ({e.prettyDuration} remaining)</>
                        }
                    </Box>
                    <Box>
                        To renew your license key, request a new/trial license at:{' '}
                        <Link href="https://redpanda.com/license-request" target="_blank" rel="noreferrer">https://redpanda.com/license-request</Link>
                    </Box>
                </Flex>
            </Alert>
        )}
    </Box>;
});
