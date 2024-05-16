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

/* eslint-disable no-useless-escape */
import Section from '../../misc/Section';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { pipelinesApi } from '../../../state/backendApi';
import PageContent from '../../misc/PageContent';
import { PageComponent, PageInitHelper } from '../Page';
import { Link } from 'react-router-dom';
import { Button } from '@redpanda-data/ui';
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsxUtils';


@observer
class RpConnectPipelinesDetails extends PageComponent<{ connectorName: string }> {

    @observable placeholder = 5;
    @observable filteredResults: ClusterConnectorInfo[] = [];

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        const connectorName = decodeURIComponent(this.props.connectorName);
        p.title = connectorName;
        p.addBreadcrumb('Redpanda Connect', '/rp-connect');
        p.addBreadcrumb(connectorName, `/rp-connect/${connectorName}`);

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        pipelinesApi.refreshPipelines(force);
    }

    isFilterMatch(filter: string, item: ClusterConnectorInfo): boolean {
        try {
            const quickSearchRegExp = new RegExp(uiSettings.pipelinesList.quickSearch, 'i')
            return Boolean(item.name.match(quickSearchRegExp)) || Boolean(item.class.match(quickSearchRegExp))
        } catch (e) {
            console.warn('Invalid expression');
            return item.name.toLowerCase().includes(filter.toLowerCase());
        }
    }

    render() {
        if (!pipelinesApi.pipelines) return DefaultSkeleton;

        return (
            <PageContent>

                <Section>

                    <div>
                        <div style={{ display: 'flex', marginBottom: '.5em' }}>
                            <Link to={'/connect-clusters/create-connector'}><Button variant="solid" colorScheme="brand" isDisabled>Create connector</Button></Link>
                        </div>

                        {/* deploy button */}

                        {/* yaml editor */}


                    </div>
                </Section>
            </PageContent>
        );
    }
}

export default RpConnectPipelinesDetails;


