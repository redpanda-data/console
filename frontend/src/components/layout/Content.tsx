/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { observer } from 'mobx-react';
import { Component } from 'react';
import { api } from '../../state/backendApi';
import { prettyMilliseconds } from '../../utils/utils';
import AppFooter from '../layout/Footer';
import AppPageHeader from '../layout/Header';
import { ErrorDisplay } from '../misc/ErrorDisplay';
import { renderErrorModals } from '../misc/ErrorModal';
import { RouteView } from '../routes';
import { ModalContainer } from '../../utils/ModalContainer';
import { Alert, AlertIcon, Box, Flex, Link, Text } from '@redpanda-data/ui';


@observer
class LicenseNotification extends Component {

    render() {
        if (!api.licenses || !api.licenses.length)
            return null;

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
            const remainingSec = x.expiresAt - unixNow;
            const remainingDays = remainingSec / (60 * 60 * 24);

            const expiredForMoreThanAYear = (remainingSec < 0 && remainingDays < -365);
            const prettyDuration = expiredForMoreThanAYear
                ? 'over a year'
                : prettyMilliseconds(Math.abs(remainingSec) * 1000, { unitCount: 2, verbose: true, secondsDecimalDigits: 0 });

            return {
                ...x,
                remainingSec,
                remainingDays,
                isExpiringSoon: remainingDays < 30,
                isExpired: remainingSec <= 0,
                sourceDisplayName: sourceNames[x.source] ?? x.source,
                typeDisplayName: typeNames[x.type] ?? x.type,
                prettyDuration,
                prettyDateTime: new Date(x.expiresAt * 1000).toLocaleDateString(),
            };
        });

        const warnings = withRemainingTime.filter(x => x.isExpiringSoon || x.isExpired);
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
                                : <> will expire <span>{e.prettyDateTime}</span> ({e.prettyDuration} remaining)</>
                            }
                        </Box>
                        <Box>
                            To renew your license key, request a new/trial license at:{' '}
                            <Link href="https://redpanda.com/license-request" target="_blank" rel="noreferrer">https://redpanda.com/license-request</Link>
                        </Box>
                    </Flex>
                </Alert>
            )}
        </Box>
    }
}


export const AppContent = observer(() =>
    <div id="mainLayout">

        {/* Page */}
        <LicenseNotification />
        <ModalContainer />
        <AppPageHeader />

        <ErrorDisplay>
            <RouteView />
        </ErrorDisplay>

        <AppFooter />

        {/* Currently disabled, read todo comment on UpdatePopup */}
        {/* <UpdatePopup /> */}
        {renderErrorModals()}

    </div>
);

export default AppContent;
