import { timestampDate } from '@bufbuild/protobuf/wkt';
import { CheckCircleIcon, ErrorIcon } from 'components/icons';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import React, { type FC, useEffect } from 'react';

import {
  DebugBundleStatus_Status,
  type GetDebugBundleStatusResponse_DebugBundleBrokerStatus,
} from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { api } from '../../../state/backend-api';

const StatusIcons: Record<DebugBundleStatus_Status, React.ReactElement> = {
  [DebugBundleStatus_Status.UNSPECIFIED]: <ErrorIcon className="text-success" size={16} />,
  [DebugBundleStatus_Status.SUCCESS]: <CheckCircleIcon className="text-success" size={16} />,
  [DebugBundleStatus_Status.RUNNING]: <Spinner />,
  [DebugBundleStatus_Status.ERROR]: <ErrorIcon className="text-destructive" size={16} />,
  [DebugBundleStatus_Status.EXPIRED]: <ErrorIcon className="text-destructive" size={16} />,
};

const DebugBundleOverview: FC<{ statuses: GetDebugBundleStatusResponse_DebugBundleBrokerStatus[] }> = ({
  statuses,
}) => {
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (api.isDebugBundleInProgress) {
        api.refreshDebugBundleStatuses().catch(() => {
          // Error handling managed by API layer
        });
      }
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);
  return (
    <div className="my-4" data-testid="debug-bundle-overview">
      <ul>
        {statuses.map((status) => (
          <li data-testid={`debug-bundle-broker-status-${status.brokerId}`} key={status.brokerId}>
            <div className="mb-3 flex items-center gap-3">
              {status.value.case === 'bundleStatus' && (
                <>
                  {StatusIcons[status.value.value.status]}
                  <div className="flex flex-col gap-0.5">
                    <div>
                      <span className="font-bold" data-testid={`broker-${status.brokerId}-label`}>
                        Broker {status.brokerId}
                      </span>
                      {status.value.value.createdAt ? (
                        <span> started at {timestampDate(status.value.value.createdAt).toLocaleString()}</span>
                      ) : null}
                    </div>
                    <div className="text-body-sm text-subtle" data-testid={`broker-${status.brokerId}-job-id`}>
                      {status.value.value.jobId}
                    </div>
                  </div>
                </>
              )}
              {status.value.case === 'error' && (
                <>
                  {StatusIcons[DebugBundleStatus_Status.ERROR]}
                  <div className="flex flex-col gap-0.5">
                    <div>
                      <span className="font-bold" data-testid={`broker-${status.brokerId}-error-label`}>
                        Broker {status.brokerId}
                      </span>
                    </div>
                    <div className="text-body-sm text-subtle" data-testid={`broker-${status.brokerId}-error-message`}>
                      {status.value.value.message}
                    </div>
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DebugBundleOverview;
