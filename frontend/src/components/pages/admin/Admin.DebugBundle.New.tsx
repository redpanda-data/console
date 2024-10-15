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
import { Alert, AlertIcon, Box, Button, Flex, FormField, Grid, GridItem, Input, PasswordInput, Text } from '@redpanda-data/ui';
import { PageComponent, PageInitHelper } from '../Page';
import { appGlobal } from '../../../state/appGlobal';
import { FC, useState } from 'react';
import { SCRAMAuth } from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { MdDeleteOutline } from 'react-icons/md';

@observer
export default class AdminPageDebugBundleNew extends PageComponent<{}> {
    @observable advancedForm = false;
    @observable submitInProgress = false;

    @observable jobId: string | undefined = undefined;
    @observable createBundleError: string | undefined = '';

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
                <Alert status="info" my={2}>
                    <AlertIcon/>
                    This is an advanced feature, best used if you have received direction to do so from Redpanda support.
                </Alert>

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
        scramAuth: {
            username: '',
            password: '',
        } as SCRAMAuth,
        skipTlsVerification: false,
        brokerIds: '' as string,
        controllerLogsSizeLimitBytes: '' as string,
        cpuProfilerWaitSeconds: '' as string,
        logsSince: '' as string,
        logsSizeLimitBytes: '' as string,
        logsUntil: '' as string,
        metricsIntervalSeconds: '' as string,
        metricsSamples: '' as string,
        namespace: '' as string,
        partitions: '' as string,
        labelSelectors: [
            {
                key: '',
                value: '',
            }
        ] as Array<{key: string, value: string}>,

        // Setters
        setUsername(username: string) {
            this.scramAuth.username = username;
        },
        setPassword(password: string) {
            this.scramAuth.password = password;
        },
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
        setMetricsSamples(samples: string) {
            this.metricsSamples = samples;
        },
        setNamespace(namespace: string) {
            this.namespace = namespace;
        },
        setPartitions(partitions: string) {
            this.partitions = partitions;
        },
        addLabelSelector() {
            this.labelSelectors.push({
                key: '',
                value: '',
            });
        },
        removeLabelSelector(idx: number) {
            this.labelSelectors.splice(idx, 1);
        },
        setLabelSelectorKey(value: string, idx: number) {
            this.labelSelectors[idx].key = value;
        },
        setLabelSelectorValue(value: string, idx: number) {
            this.labelSelectors[idx].value = value;
        },
    }));

    return (
        <Box mt={4}>
            {advancedForm && <Flex
                flexDirection="column"
                width={{
                    base: 'full',
                    sm: 500,
                }}
                gap={2}
            >
                <FormField label="SCRAM user">
                    <Input
                        data-testid="scram-user-input"
                        value={formState.scramAuth.username}
                        onChange={(e) => formState.setUsername(e.target.value)}
                    />
                </FormField>
                <FormField label="Password">
                    <PasswordInput
                        data-testid="scram-user-password"
                        value={formState.scramAuth.password}
                        onChange={(e) => formState.setPassword(e.target.value)}
                    />
                </FormField>
                <FormField label="Broker(s)" description="Specify broker IDs (comma-separated, or leave blank for all)">
                    <Input
                        data-testid="broker-ids-input"
                        value={formState.brokerIds}
                        onChange={(e) => formState.setBrokerIds(e.target.value)}
                    />
                </FormField>
                <FormField label="Controller log size limit" description={'The size limit of the controller logs that can be stored in the bundle (e.g. 3MB, 1GiB) (default "132MB")'}>
                    <Input
                        data-testid="controller-log-size-input"
                        value={formState.controllerLogsSizeLimitBytes}
                        onChange={(e) => formState.setControllerLogsSizeLimitBytes(e.target.value)}
                    />
                </FormField>
                <FormField label="CPU profiler wait" description="How long in seconds to collect samples for the CPU profiler. Must be higher than 15s (default 30s)">
                    <Input
                        data-testid="cpu-profiler-input"
                        value={formState.cpuProfilerWaitSeconds}
                        type="number"
                        onChange={(e) => formState.setCpuProfilerWaitSeconds(e.target.value)}
                    />
                </FormField>
                <FormField label="Logs since" description="Include logs dated from specified date onward; (journalctl date format: YYYY-MM-DD, 'yesterday', or 'today'). Default 'yesterday'.">
                    <Input
                        data-testid="logs-since-input"
                        value={formState.logsSince}
                        onChange={(e) => formState.setLogsSince(e.target.value)}
                    />
                </FormField>
                <FormField label="Logs until" description="Include logs older than the specified date; (journalctl date format: YYYY-MM-DD, 'yesterday', or 'today').">
                    <Input
                        data-testid="logs-until-input"
                        value={formState.logsUntil}
                        onChange={(e) => formState.setLogsUntil(e.target.value)}
                    />
                </FormField>
                <FormField label="Log size limit" description="Read the logs until the given size is reached (e.g. 3MB, 1GiB). Default 100MiB.">
                    <Input
                        data-testid="log-size-limit-input"
                        value={formState.logsSizeLimitBytes}
                        onChange={(e) => formState.setLogsSizeLimitBytes(e.target.value)}
                    />
                </FormField>
                <FormField label="Metrics interval duration" description="Interval between metrics snapshots (e.g. 30s, 1.5m) (default 10s)">
                    <Input
                        data-testid="metrics-interval-duration-input"
                        value={formState.metricsIntervalSeconds}
                        onChange={(e) => formState.setMetricsIntervalSeconds(e.target.value)}
                    />
                </FormField>
                <FormField label="Metrics samples" description="Number of metrics samples to take (at the interval of 'metrics interval duration'). Must be >= 2">
                    <Input
                        data-testid="metrics-samples-in put"
                        value={formState.metricsSamples}
                        onChange={(e) => formState.setMetricsSamples(e.target.value)}
                    />
                </FormField>
                <FormField label="Namespace" description='The namespace to use to collect the resources from (k8s only). Default "redpanda".'>
                    <Input
                        data-testid="namespace-input"
                        value={formState.namespace}
                        onChange={(e) => formState.setNamespace(e.target.value)}
                    />
                </FormField>
                <FormField label="Partition(s)" description="Comma-separated partition IDs.">
                    <Input
                        data-testid="partitions-input"
                        value={formState.partitions}
                        onChange={(e) => formState.setPartitions(e.target.value)}
                    />
                </FormField>
                <FormField label="Label selectors" description="Label selectors to filter your resources.">
                    {formState.labelSelectors.map((labelSelector, idx) =>
                        <Grid gap={2} key={idx} templateColumns="1fr 1fr auto">
                            <GridItem>
                                <Text fontSize="sm">Key</Text>
                                <Input
                                    value={labelSelector.key}
                                    onChange={(e) => {
                                        formState.setLabelSelectorKey(e.target.value, idx);
                                    }}
                                />
                            </GridItem>
                            <GridItem>
                                <Text fontSize="sm">Value</Text>
                                <Input
                                    value={labelSelector.value}
                                    onChange={(e) => {
                                        formState.setLabelSelectorValue(e.target.value, idx);
                                    }}
                                />
                            </GridItem>
                            <GridItem display="flex" alignItems="flex-end">
                                <Button variant="ghost" onClick={() => {
                                    formState.removeLabelSelector(idx);
                                }}>
                                    <MdDeleteOutline/>
                                </Button>
                            </GridItem>
                        </Grid>
                    )}
                    <Box>
                        <Button variant="outline" my={2} onClick={() => {
                            formState.addLabelSelector();
                        }}>Add</Button>
                    </Box>
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
