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
import { Box, Button, ConfirmModal, Text } from '@redpanda-data/ui';
import { Link as ReactRouterLink } from 'react-router-dom';
import DebugBundleLink from '../../debugBundle/DebugBundleLink';
import { appGlobal } from '../../../state/appGlobal';

@observer
export class AdminDebugBundle extends Component<{}> {
    @observable quickSearch = '';
    @observable confirmModalIsOpen = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!api.adminInfo) return DefaultSkeleton;

        if (api.isDebugBundleInProgress) {
            return <Box>
                <Button px={0} as={ReactRouterLink} variant="link" to={`/admin/debug-bundle/progress/${api.debugBundleStatus?.jobId}`}>Bundle generation in progress...</Button>
                <Text>Started {api.debugBundleStatus?.createdAt?.toDate().toLocaleString()}</Text>
            </Box>;
        }

        return (
            <Box>
                <DebugBundleLink statuses={api.debugBundleStatuses} showDeleteButton />
                {api.debugBundleStatuses.length === 0 && <Text>No debug bundle available for download.</Text>}
                <Box mt={4}>
                    {api.debugBundleStatuses.length ?
                        <ConfirmModal trigger="Generate new" heading="Generate new debug bundle" onConfirm={() => {
                            appGlobal.history.push('/admin/debug-bundle/new');
                            this.confirmModalIsOpen = false
                        }}>
                            You have an existing debug bundle; generating a new one will delete the previous one. Are you sure?
                        </ConfirmModal>
                        :
                        <Button as={ReactRouterLink} to="/admin/debug-bundle/new">Generate new</Button>
                    }
                </Box>
            </Box>
        );
    }
}
