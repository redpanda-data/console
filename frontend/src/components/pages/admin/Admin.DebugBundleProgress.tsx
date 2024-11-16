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
import { api, } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { makeObservable, observable } from 'mobx';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Box, Button, Flex, Text } from '@redpanda-data/ui';
import { PageComponent, PageInitHelper } from '../Page';
import { appGlobal } from '../../../state/appGlobal';
import DebugBundleOverview from './DebugBundleOverview';
import DebugBundleLink from '../../debugBundle/DebugBundleLink';
import { Link as ReactRouterLink } from 'react-router-dom';

@observer
export default class AdminPageDebugBundleProgress extends PageComponent<{}> {
    @observable advancedForm = false;
    @observable submitInProgress = false;

    @observable jobId: string | undefined = undefined;

    initPage(p: PageInitHelper): void {
        p.title = 'Generate debug bundle';
        p.addBreadcrumb('Admin', '/admin');
        p.addBreadcrumb('Generate debug bundle', '/admin/debug-bundle/progress');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshAdminInfo(force);
        api.refreshDebugBundleStatuses();
    }

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!api.adminInfo) return DefaultSkeleton;

        return (
            <Box>
                <Text>Collect environment data that can help debug and diagnose issues with a Redpanda cluster, a broker, or the machine it’s running on. This will bundle the collected data into a ZIP file.</Text>

                <Box mt={4}>
                    {api.isDebugBundleInProgress && <Text>Generating bundle...</Text>}
                    {api.isDebugBundleExpired && <Text fontWeight="bold">Your previous bundle has expired and cannot be downloaded.</Text>}
                    {api.isDebugBundleError && <Text>This debug bundle was cancelled by the user and is not available for download.</Text>}
                    {api.canDownloadDebugBundle && <Box>
                        <Flex gap={2}>
                            <Text fontWeight="bold">Debug bundle complete:</Text>
                            <DebugBundleLink statuses={api.debugBundleStatuses} showDatetime={false}/>
                        </Flex>
                    </Box>}
                </Box>

                {!api.isDebugBundleExpired && <Box mt={2}>
                    {api.debugBundleStatuses && <DebugBundleOverview statuses={api.debugBundleStatuses} />}

                    <Box my={2}>
                        {api.isDebugBundleInProgress ? <Button variant="outline" onClick={() => {
                            api.debugBundleStatuses.forEach(status => {
                                if (status.value.case==='bundleStatus') {
                                    void api.cancelDebugBundleProcess({jobId: status.value.value.jobId});
                                }
                            });
                        }}>Stop</Button>:<Button variant="outline" as={ReactRouterLink} to="/admin">Done</Button>}
                    </Box>
                </Box>}
            </Box>
        );
    }
}
