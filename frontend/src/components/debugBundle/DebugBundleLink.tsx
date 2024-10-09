import React from 'react';
import { DebugBundleStatus, DeleteDebugBundleFile, GetDebugBundleStatusResponse_DebugBundleBrokerStatus } from '../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { config } from '../../config';
import { api } from '../../state/backendApi';
import { Button, IconButton } from '@redpanda-data/ui';
import { MdDeleteOutline } from 'react-icons/md';

const DebugBundleLink = ({ statuses, showDeleteButton = false }: { statuses: GetDebugBundleStatusResponse_DebugBundleBrokerStatus[], showDeleteButton?: boolean }) => {
    const statusWithFilename = statuses.find(status => status.value.case === 'bundleStatus' && status.value.value.filename)
    const filename = (statusWithFilename?.value.value as DebugBundleStatus)?.filename;
    const downloadFilename = 'debug-bundle.zip'


    if(statuses.length === 0) {
        return null
    }

    if(!filename) {
        return null
    }

    return (
        <>
            <Button
                variant="link"
                onClick={() => {
                    config.fetch(`${config.restBasePath}/debug_bundle/file.zip`).then(async response => {
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
            </Button>
            {showDeleteButton && <IconButton
                variant="ghost"
                icon={<MdDeleteOutline/>}
                aria-label="Delete file"
                onClick={() => {
                    void api.deleteDebugBundleFile({
                        file: {
                            filename,
                        } as DeleteDebugBundleFile
                    });
                }}
            />}
        </>
    );
};

export default DebugBundleLink;
