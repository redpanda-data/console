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

import { Component } from 'react';
import { observer } from 'mobx-react';
import { api, } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { makeObservable, observable } from 'mobx';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Box, Button, Flex, IconButton, List, ListItem, Text } from '@redpanda-data/ui';
import { Link as ReactRouterLink } from 'react-router-dom';
import { MdDeleteOutline } from 'react-icons/md';
import { DeleteDebugBundleFile } from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { config } from '../../../config';

@observer
export class AdminDebugBundle extends Component<{}> {
    @observable quickSearch = '';

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!api.adminInfo) return DefaultSkeleton;

        return (
            <Box>
                <List>
                    {api.debugBundleStatuses.map((status, idx) =>
                        <ListItem key={idx}>
                            <Flex gap={2}>
                                <Button
                                    variant="link"
                                    as="a"
                                    href={`${config.restBasePath}/debug/bundle/file/${status.filename}`}
                                    px={0}
                                >
                                    {status.filename}
                                </Button>
                                <IconButton
                                    variant="ghost"
                                    icon={<MdDeleteOutline/>}
                                    aria-label="Delete file"
                                    onClick={() => {
                                        void api.deleteDebugBundleFile({
                                            file: {
                                                filename: status.filename
                                            } as DeleteDebugBundleFile
                                        })
                                    }}
                                />
                            </Flex>
                            <Text>Generated {status.createdAt?.toDate().toLocaleString()}</Text>
                            {/*{JSON.stringify(status)}*/}
                        </ListItem>
                    )}
                </List>
                {api.debugBundleStatuses.length === 0 && <Text>No pre-existing debug bundle.</Text>}
                <Box mt={4}>
                    <Button as={ReactRouterLink} to="/admin/debug-bundle/new">Generate new</Button>
                </Box>
            </Box>
        )
    }
}
