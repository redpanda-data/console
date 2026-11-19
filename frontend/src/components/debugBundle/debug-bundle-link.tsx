import { timestampDate } from '@bufbuild/protobuf/wkt';
import { TrashIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';

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
    <div>
      <div className="flex items-center gap-1">
        <button
          className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary underline underline-offset-4"
          onClick={() => {
            const headers: HeadersInit = {};
            if (config.jwt) {
              headers.Authorization = `Bearer ${config.jwt}`;
            }

            config
              .fetch(`${config.restBasePath}/debug_bundle/files/${downloadFilename}`, { headers })
              .then(async (response) => {
                const url = window.URL.createObjectURL(await response.blob());

                const a = document.createElement('a');

                a.href = url;
                a.download = downloadFilename;

                // Append the anchor to the document body (necessary for Firefox)
                document.body.appendChild(a);

                a.click();

                document.body.removeChild(a);

                window.URL.revokeObjectURL(url);
              });
          }}
          type="button"
        >
          {downloadFilename}
        </button>
        {Boolean(showDeleteButton) && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Delete file"
                  onClick={() => {
                    api.deleteDebugBundleFile().catch(() => {});
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

export default DebugBundleLink;
