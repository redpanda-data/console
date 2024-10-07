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
import { Alert, AlertIcon, Box, Button, Flex, FormField, Input, Text } from '@redpanda-data/ui';
import { PageComponent, PageInitHelper } from '../Page';
import { appGlobal } from '../../../state/appGlobal';
import { SingleSelect } from '../../misc/Select';
import { FC, useState } from 'react';
import DebugBundleOverview from './DebugBundleOverview';

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
        api.getDebugBundleStatuses();
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
                Generation progress

                {this.createBundleError && <Alert status="error">
                    <AlertIcon/>
                    {this.createBundleError}
                </Alert>}
                {this.submitInProgress ? <Box>
                    Generating bundle ...
                    </Box>
                    : (api.debugBundleStatuses ? <DebugBundleOverview statuses={api.debugBundleStatuses} /> :
                    <NewDebugBundleForm onSubmit={() => {
                        this.submitInProgress = true;
                        this.createBundleError = undefined;
                        api.createDebugBundle().then(result => {
                            console.log({result});
                        }).catch(err => {
                            this.createBundleError = err.message
                        }).finally(() => {
                            this.submitInProgress = false;
                        })
                    }}/>)}
            </Box>
        );
    }
}


const NewDebugBundleForm: FC<{ onSubmit: () => void }> = observer(({onSubmit}) => {
    const [advancedForm, setAdvancedForm] = useState(false);
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
                        value={''}
                        onChange={() => {
                        }}
                        options={[]}
                    />
                </FormField>
                <FormField label="CPU profiler wait (in seconds)">
                    <Input
                    />
                </FormField>
                <FormField label="Logs since">
                    <SingleSelect
                        value={''}
                        onChange={() => {
                        }}
                        options={[]}
                    />
                </FormField>
                <FormField label="Log size limit in MiB, up to X">
                    <Input
                    />
                </FormField>
                <FormField label="Logs until">
                    <Input
                    />
                </FormField>
                <FormField label="Metrics interval (in seconds)">
                    <Input
                    />
                </FormField>
                <FormField label="Partition">
                    <Input
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
                          onSubmit()
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
