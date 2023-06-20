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
import { Empty } from 'antd';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { computed, makeObservable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { KowlColumnType, KowlTable } from '../../misc/KowlTable';
import { LockIcon, SkipIcon } from '@primer/octicons-react';
import { toJson } from '../../../utils/jsonUtils';
import { prettyBytes, prettyNumber } from '../../../utils/utils';
import { QuotaType } from '../../../state/restInterfaces';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Alert, AlertIcon, Button } from '@redpanda-data/ui';

@observer
class QuotasList extends PageComponent {
    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Quotas';
        p.addBreadcrumb('Quotas', '/quotas');

        this.refreshData(false);
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

        const columns: KowlColumnType<typeof resources[0]>[] = [
            { width: '100px', title: 'Type', dataIndex: 'entityType', sorter: sortField('entityType'), defaultSortOrder: 'ascend' },
            { width: 'auto', title: 'Name', dataIndex: 'entityName', sorter: sortField('entityName') },
            { width: '100px', title: 'Producer Rate', render: (_, e) => formatBytes(e.settings.first(k => k.key == QuotaType.PRODUCER_BYTE_RATE)?.value) },
            { width: '100px', title: 'Consumer Rate', render: (_, e) => formatBytes(e.settings.first(k => k.key == QuotaType.CONSUMER_BYTE_RATE)?.value) },
            { width: '100px', title: 'Connection Creation Rate', render: (_, e) => formatRate(e.settings.first(k => k.key == QuotaType.CONNECTION_CREATION_RATE)?.value) },
            { width: '100px', title: 'Request Handler', render: (_, e) => formatPercentage(e.settings.first(k => k.key == QuotaType.REQUEST_PERCENTAGE)?.value) },
        ];

        return <>
            <PageContent>
                <Section>
                    {warning}

                    <KowlTable
                        dataSource={resources}
                        columns={columns}

                        observableSettings={uiSettings.quotasList}

                        rowKey={x => x.eqKey}
                        rowClassName={() => 'pureDisplayRow'}
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
            <Empty description={null}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2><span><LockIcon verticalAlign="middle" size={20} /></span> Permission Denied</h2>
                    <p>
                        You are not allowed to view this page.
                        <br />
                        Contact the administrator if you think this is an error.
                    </p>
                </div>

                <a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
                    <Button variant="solid">Redpanda Console documentation for roles and permissions</Button>
                </a>
            </Empty>
        </Section>
    </PageContent>
</>

export default QuotasList;
