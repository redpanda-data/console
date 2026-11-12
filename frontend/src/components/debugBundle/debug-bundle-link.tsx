import { timestampDate } from '@bufbuild/protobuf/wkt';
import { TrashIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { reportActionError } from 'utils/toast.utils';

import type { GetDebugBundleStatusResponse_DebugBundleBrokerStatus } from '../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { config } from '../../runtime-config';
import { api } from '../../state/backend-api';
import { isNonEmptyString } from '../../utils/string-utils';

const DebugBundleLink = ({
  statuses,
  showDeleteButton = false,
  showDatetime = true,
}: {
  statuses: GetDebugBundleStatusResponse_DebugBundleBrokerStatus[];
  showDeleteButton?: boolean;
  showDatetime?: boolean;
}) => {
  const statusWithFilename = statuses.flatMap((status) =>
    status.value.case === 'bundleStatus' && status.value.value.filename !== '' ? [status.value.value] : []
  )[0];
  const downloadFilename = 'debug-bundle.zip';

  if (statuses.length === 0) {
    return null;
  }

  if (!isNonEmptyString(statusWithFilename?.filename)) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <Button
          // biome-ignore lint/nursery/noTailwindRestyledComponents: Registry unstyled variant owns this compound control's appearance.
          className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary underline underline-offset-4"
          onClick={() => {
            // Add JWT Bearer token if available (same as REST and gRPC calls)
            const headers: HeadersInit = {};
            if (isNonEmptyString(config.jwt)) {
              headers.Authorization = `Bearer ${config.jwt}`;
            }

            config
              .fetch(`${config.restBasePath}/debug_bundle/files/${downloadFilename}`, { headers })
              .then(async (response) => {
                if (!response.ok) {
                  throw new Error(`Bundle download failed: ${response.status}`);
                }
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
              })
              .catch(reportActionError);
          }}
          type="button"
          variant="unstyled"
        >
          {downloadFilename}
        </Button>
        {Boolean(showDeleteButton) && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Delete file"
                  onClick={() => {
                    api.deleteDebugBundleFile().catch(reportActionError);
                  }}
                  size="icon-sm"
                  variant="destructive-ghost"
                >
                  <TrashIcon />
                </Button>
              }
            />
            <TooltipContent side="top">Delete bundle</TooltipContent>
          </Tooltip>
        )}
      </div>
      {Boolean(showDatetime) && statusWithFilename.createdAt && (
        <div>Generated {timestampDate(statusWithFilename.createdAt).toLocaleString()}</div>
      )}
    </div>
  );
};

export { DebugBundleLink };
