import { Alert, AlertDescription, AlertIcon, Box } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { FC, ReactElement } from 'react';
import { License, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { getExpirationDate, getMillisecondsToExpiration, getPrettyTimeToExpiration, licenseSoonToExpire } from './licenseUtils';

type InlineLicenseNotificationProps = {
    license: License;
}

const licenseMessage = (license: License | null): ReactElement | null  => {
    if(license === null) {
        return null
    }

    const msToExpiration = getMillisecondsToExpiration(license);
    const isExpired = msToExpiration <= 0;

    if (license.type === License_Type.TRIAL && isExpired) {
        return (
            <>This is an enterprise feature and your license has expired; this is now read-only. To get an enterprise license, contact us.</>
        );
    }

    if (license.type === License_Type.TRIAL && !isExpired && licenseSoonToExpire(license)) {
        return (
            <>Your Redpanda Enterprise trial is expiring in {getPrettyTimeToExpiration(license)}. To get a full Enterprise license, contact us.</>
        );
    }

    if (license.type === License_Type.TRIAL && !isExpired && !licenseSoonToExpire(license)) {
        return (
            <>
                This is an enterprise feature. It's free until{' '}
                {new Intl.DateTimeFormat('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                }).format(getExpirationDate(license))}{' '}
                ({getPrettyTimeToExpiration(license)}). Register here to extend your free trial.
            </>
        );
    }

    return null;
};

export const InlineLicenseNotification: FC<InlineLicenseNotificationProps> = observer(({ license }) => {
    const message = licenseMessage(license);

    if(!license) {
        return null
    }

    if (message === null) {
        return null;
    }

    return (
        <Box>
            <Alert
                mb={4}
                status="info"
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
