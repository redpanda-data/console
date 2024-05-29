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
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';


const defaultConfig = `
input:
  stdin: {}

pipeline:
  processors:
    - mapping: root = content().uppercase()

output:
  stdout: {}

hereIsAnInvalidProperty:
    - "that should"
    - "be highlighted"
    - "as wrong"
`;

@observer
class RpConnectPipelinesDetails extends PageComponent<{ connectorName: string }> {

    @observable placeholder = 5;
    @observable editorContent = defaultConfig;

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

    refreshData(_force: boolean) {
        // pipelinesApi.refreshPipelines(force);
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
        // if (!pipelinesApi.pipelines) return DefaultSkeleton;

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
                                value={this.editorContent}
                                onChange={e => {
                                    if (e)
                                        this.editorContent = e;
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


