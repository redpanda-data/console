import { timestampDate } from '@bufbuild/protobuf/wkt';
import { Box, Flex, IconButton, Text, Tooltip } from '@redpanda-data/ui';
import { TrashIcon } from 'components/icons';

import { config } from '../../config';
import type {
  DebugBundleStatus,
  GetDebugBundleStatusResponse_DebugBundleBrokerStatus,
} from '../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { api } from '../../state/backend-api';

const DebugBundleLink = ({
  statuses,
  showDeleteButton = false,
  showDatetime = true,
}: {
  statuses: GetDebugBundleStatusResponse_DebugBundleBrokerStatus[];
  showDeleteButton?: boolean;
  showDatetime?: boolean;
}) => {
  const statusWithFilename = statuses.find(
    (status) => status.value.case === 'bundleStatus' && status.value.value.filename
  )?.value.value as DebugBundleStatus | undefined;
  const downloadFilename = 'debug-bundle.zip';

  if (statuses.length === 0) {
    return null;
  }

  if (!statusWithFilename?.filename) {
    return null;
  }

  return (
    <Box>
      <Flex alignItems="center" gap={1}>
        <button
          className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary underline underline-offset-4"
          onClick={() => {
            config.fetch(`${config.restBasePath}/debug_bundle/files/${downloadFilename}`).then(async (response) => {
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
          type="button"
        >
          {downloadFilename}
        </button>
        {Boolean(showDeleteButton) && (
          <Tooltip hasArrow label="Delete bundle" placement="top">
            <IconButton
              aria-label="Delete file"
              icon={<TrashIcon />}
              onClick={() => {
                api.deleteDebugBundleFile().catch(() => {
                  // Error handling should be managed by the API layer
                });
              }}
              variant="destructive-ghost"
            />
          </Tooltip>
        )}
      </Flex>
      {Boolean(showDatetime) && statusWithFilename.createdAt && (
        <Text>Generated {timestampDate(statusWithFilename.createdAt).toLocaleString()}</Text>
      )}
    </Box>
  );
};

export default DebugBundleLink;
