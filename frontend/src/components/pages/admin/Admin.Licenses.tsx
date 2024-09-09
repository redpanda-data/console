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


import React, { Component } from 'react';
import { observer } from 'mobx-react';
import { api, } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Box, Empty, List, ListItem, Text } from '@redpanda-data/ui';
import { licenseCanExpire, prettyExpirationDate, prettyLicenseType } from '../../license/licenseUtils';


@observer
export class AdminLicenses extends Component<{}> {

    render() {
        if (!api.licensesLoaded) return DefaultSkeleton
        const licenses = api.licenses;

        if(licenses.length === 0) {
            return <Box>
                <Empty />
            </Box>
        }

        return (
            <Box>
                <Text mb={2}>The following licenses are used:</Text>
                <List>
                    {licenses.map(((license, idx) => <ListItem key={idx}><strong>{prettyLicenseType(license, true)}</strong> {licenseCanExpire(license) ? `expiring ${prettyExpirationDate(license)}`: ''}</ListItem>))}
                </List>
            </Box>
        );
    }
}
