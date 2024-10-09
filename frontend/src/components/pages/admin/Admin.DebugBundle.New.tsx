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

import { observer, useLocalObservable } from 'mobx-react';
import { api, } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { makeObservable, observable } from 'mobx';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Alert, AlertIcon, Box, Button, Flex, FormField, Input, Text } from '@redpanda-data/ui';
import { PageComponent, PageInitHelper } from '../Page';
import { appGlobal } from '../../../state/appGlobal';
import { SingleSelect } from '../../misc/Select';
import { FC, useState } from 'react';

@observer
export default class AdminPageDebugBundleNew extends PageComponent<{}> {
    @observable advancedForm = false;
    @observable submitInProgress = false;

    @observable jobId: string | undefined = undefined;
    @observable createBundleError: string | undefined = '';

    initPage(p: PageInitHelper): void {
        p.title = 'Admin';
        p.addBreadcrumb('Admin', '/admin');

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

                {this.createBundleError && <Alert status="error">
                    <AlertIcon/>
                    {this.createBundleError}
                </Alert>}

                {this.submitInProgress ? <Box>
                        Generating bundle ...
                    </Box>
                    :
                    <NewDebugBundleForm onSubmit={() => {
                        this.submitInProgress = true;
                        this.createBundleError = undefined;
                        api.createDebugBundle().then(result => {
                            appGlobal.history.push(`/admin/debug-bundle/progress/${result.jobId}`)
                        }).catch(err => {
                            this.createBundleError = err.message;
                        }).finally(() => {
                            this.submitInProgress = false;
                        });
                    }}/>}
            </Box>
        );
    }
}


const NewDebugBundleForm: FC<{ onSubmit: () => void }> = observer(({onSubmit}) => {
    const [advancedForm, setAdvancedForm] = useState(false);

    const formState = useLocalObservable(() => ({
        brokerIds: '' as string,
        controllerLogsSizeLimitBytes: '' as string,
        cpuProfilerWaitSeconds: '' as string,
        logsSince: '' as string,
        logsSizeLimitBytes: '' as string,
        logsUntil: '' as string,
        metricsIntervalSeconds: '' as string,
        partitions: '' as string,

        // Setters
        setBrokerIds(ids: string) {
            this.brokerIds = ids;
        },
        setControllerLogsSizeLimitBytes(size: string) {
            this.controllerLogsSizeLimitBytes = size;
        },
        setCpuProfilerWaitSeconds(seconds: string) {
            this.cpuProfilerWaitSeconds = seconds;
        },
        setLogsSince(date: string) {
            this.logsSince = date;
        },
        setLogsSizeLimitBytes(size: string) {
            this.logsSizeLimitBytes = size;
        },
        setLogsUntil(date: string) {
            this.logsUntil = date;
        },
        setMetricsIntervalSeconds(seconds: string) {
            this.metricsIntervalSeconds = seconds;
        },
        setPartitions(partitions: string) {
            this.partitions = partitions;
        },
    }));

    return (
        <Box mt={4}>
            {advancedForm && <Flex
                flexDirection="column"
                width={{
                    base: 'full',
                    sm: 400,
                }}
                gap={2}
            >
                <FormField label="Broker">
                    <Input
                        data-testid="broker-input"
                    />
                </FormField>
                <FormField label="Controller log size limit">
                    <SingleSelect
                        value={formState.controllerLogsSizeLimitBytes}
                        onChange={(value) => formState.setControllerLogsSizeLimitBytes(value)}
                        options={[{label: '100MB', value: '104857600'}]}
                    />
                </FormField>
                <FormField label="CPU profiler wait (in seconds)">
                    <Input
                        value={formState.cpuProfilerWaitSeconds}
                        onChange={(e) => formState.setCpuProfilerWaitSeconds(e.target.value)}
                    />
                </FormField>
                <FormField label="Logs since">
                    <SingleSelect
                        value={formState.logsSince}
                        onChange={(date) => formState.setLogsSince(date)}
                        options={[]} // You need to provide date-related options
                    />
                </FormField>
                <FormField label="Log size limit in MiB, up to X">
                    <Input
                        value={formState.logsSizeLimitBytes}
                        onChange={(e) => formState.setLogsSizeLimitBytes(e.target.value)}
                    />
                </FormField>
                <FormField label="Logs until">
                    <Input
                        value={formState.logsUntil}
                        onChange={(e) => formState.setLogsUntil(e.target.value)}
                    />
                </FormField>
                <FormField label="Metrics interval (in seconds)">
                    <Input
                        value={formState.metricsIntervalSeconds}
                        onChange={(e) => formState.setMetricsIntervalSeconds(e.target.value)}
                    />
                </FormField>
                <FormField label="Partition">
                    <Input
                        value={formState.partitions}
                        onChange={(e) => formState.setPartitions(e.target.value)}
                    />
                </FormField>
            </Flex>}

            <Flex gap={2} mt={4}>
                {advancedForm ?
                    <>
                        <Button onClick={() => {
                            onSubmit();
                        }}>Generate</Button>
                        <Button variant="link" onClick={() => {
                            setAdvancedForm(false);
                        }}>Cancel</Button>
                    </>
                    :
                    <>
                        <Button onClick={async () => {
                            onSubmit();
                        }}>Generate default</Button>
                        <Button variant="link" onClick={() => {
                            setAdvancedForm(true);
                        }}>
                            or customize
                        </Button>
                    </>}
            </Flex>
        </Box>
    );
});
