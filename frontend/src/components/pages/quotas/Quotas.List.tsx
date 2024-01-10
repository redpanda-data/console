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
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { computed, makeObservable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { SkipIcon } from '@primer/octicons-react';
import { toJson } from '../../../utils/jsonUtils';
import { prettyBytes, prettyNumber } from '../../../utils/utils';
import { QuotaResponseSetting, QuotaType } from '../../../state/restInterfaces';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Alert, AlertIcon, Button, DataTable, Result } from '@redpanda-data/ui';

@observer
class QuotasList extends PageComponent {
    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Quotas';
        p.addBreadcrumb('Quotas', '/quotas');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListQuotas) return;
        api.refreshQuotas(force);
    }

    render() {
        if (api.userData != null && !api.userData.canListQuotas) return PermissionDenied;
        if (api.Quotas === undefined) return DefaultSkeleton;

        const warning = api.Quotas === null
            ? <Alert variant="solid" status="warning" style={{ marginBottom: '1em' }}>
                <AlertIcon />
                You do not have the necessary permissions to view Quotas
            </Alert>
            : null;

        const resources = this.quotasList;
        const formatBytes = (x: undefined | number) => x ? prettyBytes(x) : <span style={{ opacity: 0.30 }}><SkipIcon /></span>
        const formatRate = (x: undefined | number) => x ? prettyNumber(x) : <span style={{ opacity: 0.30 }}><SkipIcon /></span>
        const formatPercentage = (x: undefined | number) => x ? `${x}%` : <span style={{ opacity: 0.30 }}><SkipIcon /></span>

        return <>
            <PageContent>
                <Section>
                    {warning}

                    <DataTable<{ eqKey: string, entityType: 'client-id' | 'user' | 'ip', entityName?: string | undefined, settings: QuotaResponseSetting[] }>
                        size="sm"
                        data={resources}
                        columns={[
                            {
                                size: 100, // Assuming '100px' translates to '100'
                                header: 'Type',
                                accessorKey: 'entityType'
                            },
                            {
                                size: 100, // 'auto' width replaced with an example number
                                header: 'Name',
                                accessorKey: 'entityName'
                            },
                            {
                                size: 100,
                                header: 'Producer Rate',
                                cell: ({row: {original}}) => formatBytes(original.settings.first(k => k.key == QuotaType.PRODUCER_BYTE_RATE)?.value)
                            },
                            {
                                size: 100,
                                header: 'Consumer Rate',
                                cell: ({row: {original}}) => formatBytes(original.settings.first(k => k.key == QuotaType.CONSUMER_BYTE_RATE)?.value)
                            },
                            {
                                size: 100,
                                header: 'Connection Creation Rate',
                                cell: ({row: {original}}) => formatRate(original.settings.first(k => k.key == QuotaType.CONNECTION_CREATION_RATE)?.value)
                            },
                            {
                                size: 100,
                                header: 'Request Handler',
                                cell: ({row: {original}}) => formatPercentage(original.settings.first(k => k.key == QuotaType.REQUEST_PERCENTAGE)?.value)
                            }
                        ]}
                    />
                </Section>
            </PageContent>
        </>
    }

    @computed get quotasList() {
        const quotaResponse = api.Quotas;
        if (!quotaResponse || quotaResponse.error) return [];

        return quotaResponse.items.map(x => ({ ...x, eqKey: toJson(x) }));
    }
}

const PermissionDenied = <>
    <PageContent key="quotasNoPerms">
        <Section>
            <Result
                title="Forbidden"
                status={403}
                userMessage={<p>You are not allowed to view this page.
                    <br/>
                    Contact the administrator if you think this is an error.</p>
                }
                extra={<a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
                    <Button variant="solid">Redpanda Console documentation for roles and permissions</Button>
                </a>}
            />
        </Section>
    </PageContent>
</>

export default QuotasList;
