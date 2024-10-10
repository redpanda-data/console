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

import { Component } from 'react';
import { observer } from 'mobx-react';
import { api, } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { makeObservable, observable } from 'mobx';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Box, Button, Text } from '@redpanda-data/ui';
import { Link as ReactRouterLink } from 'react-router-dom';
import DebugBundleLink from '../../debugBundle/DebugBundleLink';

@observer
export class AdminDebugBundle extends Component<{}> {
    @observable quickSearch = '';

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!api.adminInfo) return DefaultSkeleton;

        if (api.isDebugBundleInProgress) {
            return <Box>
                <Button as={ReactRouterLink} variant="link" to={`/admin/debug-bundle/progress/${api.debugBundleJobId}`}>Bundle generation in progress...</Button>
            </Box>;
        }

        return (
            <Box>
                <DebugBundleLink statuses={api.debugBundleStatuses} showDeleteButton />
                {api.debugBundleStatuses.length === 0 && <Text>No pre-existing debug bundle.</Text>}
                <Box mt={4}>
                    <Button as={ReactRouterLink} to="/admin/debug-bundle/new">Generate new</Button>
                </Box>
            </Box>
        );
    }
}
