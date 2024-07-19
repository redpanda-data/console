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
import PageContent from '../../misc/PageContent';
import { PageComponent, PageInitHelper } from '../Page';
import { Box, Button } from '@redpanda-data/ui';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import { pipelinesApi } from '../../../state/backendApi';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { decodeURIComponentPercents } from '../../../utils/utils';



@observer
class RpConnectPipelinesDetails extends PageComponent<{ pipelineId: string }> {

    @observable placeholder = 5;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        const pipelineId = decodeURIComponentPercents(this.props.pipelineId);
        p.title = pipelineId;
        p.addBreadcrumb('Redpanda Connect', '/connect-clusters');
        p.addBreadcrumb(pipelineId, `/rp-connect/${pipelineId}`);

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(_force: boolean) {
        pipelinesApi.refreshPipelines(_force);
    }


    render() {
        if (!pipelinesApi.pipelines) return DefaultSkeleton;
        const pipelineId = decodeURIComponentPercents(this.props.pipelineId);
        const pipeline = pipelinesApi.pipelines.first(x => x.id == pipelineId);

        if (!pipeline) return DefaultSkeleton;

        return (
            <PageContent>

                <Section>

                    <div>
                        <div style={{ display: 'flex', marginBottom: '.5em' }}>
                            <Button variant="solid" colorScheme="brand" isDisabled>Deploy</Button>
                        </div>

                        {/* deploy button */}

                        {/* yaml editor */}
                        <Box height="400px">
                            <PipelinesYamlEditor
                                defaultPath="config.yaml"
                                path="config.yaml"
                                value={pipeline.configYaml}
                                onChange={e => {
                                    if (e)
                                        pipeline.configYaml = e;
                                }}
                                language="yaml"
                            />

                        </Box>

                    </div>
                </Section>
            </PageContent>
        );
    }
}

export default RpConnectPipelinesDetails;


export const PipelineEditor = observer((_p: {}) => {

    return <></>

});
