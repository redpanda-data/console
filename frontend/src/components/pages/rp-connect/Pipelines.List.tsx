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
import { Box, Button, DataTable, SearchField, Text } from '@redpanda-data/ui';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { ConnectPipeline, ConnectPipeline_State } from '../../../protogen/redpanda/api/console/v1alpha1/rp_connect_pb';
import { proto3 } from '@bufbuild/protobuf';

@observer
class RpConnectPipelinesList extends PageComponent<{}> {

    @observable placeholder = 5;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.addBreadcrumb('Redpanda Connect Pipelines', '/rp-connect');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        pipelinesApi.refreshPipelines(force);
    }

    render() {
        if (!pipelinesApi.pipelines) return DefaultSkeleton;

        const filteredPipelines = (pipelinesApi.pipelines ?? [])
            .filter(u => {
                const filter = uiSettings.pipelinesList.quickSearch;
                if (!filter) return true;
                try {
                    const quickSearchRegExp = new RegExp(filter, 'i');
                    return u.name.match(quickSearchRegExp);
                } catch { return false; }
            });

        return (
            <PageContent>
                <Section>
                    {/* Connectors List */}
                    <div>
                        <div style={{ display: 'flex', marginBottom: '.5em' }}>
                            <Link to={'/rp-connect/create-connector'}><Button variant="solid" colorScheme="brand" isDisabled>Create connector</Button></Link>
                        </div>

                        <Box my={5}>
                            <SearchField width="350px"
                                searchText={uiSettings.pipelinesList.quickSearch}
                                setSearchText={x => uiSettings.pipelinesList.quickSearch = x}
                                placeholderText="Enter search term / regex..."
                            />
                        </Box>

                        <DataTable<ConnectPipeline>
                            data={filteredPipelines}
                            pagination
                            defaultPageSize={10}
                            sorting
                            columns={[
                                {
                                    header: 'Pipeline Name',
                                    cell: ({ row: { original } }) => (
                                        <Link to={`/rp-connect/${encodeURIComponent(original.name)}`}>
                                            <Text wordBreak="break-word" whiteSpace="break-spaces">{original.name}</Text>
                                        </Link>
                                    ),
                                    size: Infinity
                                },
                                {
                                    header: 'State',
                                    cell: ({ row: { original } }) => {
                                        const enumType = proto3.getEnumType(ConnectPipeline_State);
                                        const entry = enumType.findNumber(original.state);
                                        return <>
                                            {entry?.name ?? original.state}
                                        </>
                                    }
                                },
                                {
                                    header: 'Input',
                                    accessorKey: 'input',
                                    size: 100,
                                },
                                {
                                    header: 'Output',
                                    accessorKey: 'output',
                                    size: 100,
                                }
                            ]}
                        />
                    </div>

                </Section>
            </PageContent>
        );
    }
}

export default RpConnectPipelinesList;


