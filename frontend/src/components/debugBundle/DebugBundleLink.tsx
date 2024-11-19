import React from 'react';
import { DebugBundleStatus, GetDebugBundleStatusResponse_DebugBundleBrokerStatus } from '../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { config } from '../../config';
import { api } from '../../state/backendApi';
import { Box, Text, IconButton, Link, Flex, Tooltip } from '@redpanda-data/ui';
import { MdDeleteOutline } from 'react-icons/md';

const DebugBundleLink = ({ statuses, showDeleteButton = false, showDatetime = true, isExpired = false }: { statuses: GetDebugBundleStatusResponse_DebugBundleBrokerStatus[], showDeleteButton?: boolean, showDatetime?: boolean, isExpired?: boolean }) => {
    const statusWithFilename = statuses.find(status => status.value.case === 'bundleStatus' && status.value.value.filename)?.value.value as DebugBundleStatus | undefined
    const downloadFilename = 'debug-bundle.zip'

    if(statuses.length === 0) {
        return null
    }

    if(!statusWithFilename?.filename) {
        return null
    }

    return (
        <Box>
            <Flex alignItems="center" gap={1}>
                {isExpired ? <Text>Your previous bundle has expired and cannot be downloaded.</Text> : <Link
                    role="button"
                    onClick={() => {
                        config.fetch(`${config.restBasePath}/debug_bundle/files/${downloadFilename}`).then(async response => {
                            const url = window.URL.createObjectURL(await response.blob());

                            // Create a new anchor element
                            const a = document.createElement('a');

                            // Set the download URL and filename
                            a.href = url;
                            a.download = downloadFilename;

                            // Append the anchor to the document body (necessary for Firefox)
                            document.body.appendChild(a);

                            // Programmatically trigger the download
                            a.click();

                            // Remove the anchor from the DOM
                            document.body.removeChild(a);

                            // Revoke the temporary URL to free memory
                            window.URL.revokeObjectURL(url);
                        });
                    }}
                    px={0}
                >
                    {downloadFilename}
                </Link>}
                {showDeleteButton && <Tooltip placement="top" label="Delete bundle" hasArrow><IconButton
                    variant="ghost"
                    icon={<MdDeleteOutline/>}
                    aria-label="Delete file"
                    onClick={() => {
                        void api.deleteDebugBundleFile();
                    }}
                /></Tooltip>}
            </Flex>
            {showDatetime && <Text>
                Generated {statusWithFilename.createdAt?.toDate().toLocaleString()}
            </Text>}
        </Box>
    );
};

export default DebugBundleLink;
