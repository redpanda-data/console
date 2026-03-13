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

import { Link } from '@tanstack/react-router';

import { api, useApiStoreHook } from '../../../state/backend-api';
import '../../../utils/array-extensions';
import { Box, Button, Flex, Text } from '@redpanda-data/ui';
import { type FC, useEffect } from 'react';

import DebugBundleOverview from './debug-bundle-overview';
import { DebugBundleStatus_Status } from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { appGlobal } from '../../../state/app-global';
import DebugBundleLink from '../../debugBundle/debug-bundle-link';
import { PageComponent, type PageInitHelper } from '../page';

export default class AdminPageDebugBundleProgress extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Generate debug bundle';
    p.addBreadcrumb('Generate debug bundle', '/debug-bundle/progress');

    this.refreshData();
    appGlobal.onRefresh = () => this.refreshData();
  }

  refreshData() {
    api.refreshDebugBundleStatuses().catch(() => {
      // Error handling managed by API layer
    });
  }

  render() {
    return <AdminPageDebugBundleProgressContent />;
  }
}

const AdminPageDebugBundleProgressContent: FC = () => {
  const statuses = useApiStoreHook((s) => s.debugBundleStatuses);

  const isInProgress = statuses.some(
    (s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.RUNNING
  );
  const isExpired =
    statuses.length > 0 &&
    !isInProgress &&
    statuses.some((s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.EXPIRED);
  const isError =
    statuses.length > 0 &&
    !isInProgress &&
    statuses.every((s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.ERROR);
  const canDownload =
    statuses.length > 0 &&
    !isInProgress &&
    statuses.some((s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.SUCCESS);

  // Fetch immediately on mount, then poll every 2 seconds
  useEffect(() => {
    api.refreshDebugBundleStatuses().catch(() => {
      // Error handling managed by API layer
    });
    const interval = setInterval(() => {
      api.refreshDebugBundleStatuses().catch(() => {
        // Error handling managed by API layer
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <Text data-testid="debug-bundle-description">
        Collect environment data that can help debug and diagnose issues with a Redpanda cluster, a broker, or the
        machine it's running on. This will bundle the collected data into a ZIP file.
      </Text>

      <Box mt={4}>
        {Boolean(isInProgress) && <Text data-testid="debug-bundle-generating-text">Generating bundle...</Text>}
        {Boolean(isExpired) && (
          <Text data-testid="debug-bundle-expired-text" fontWeight="bold">
            Your previous bundle has expired and cannot be downloaded.
          </Text>
        )}
        {Boolean(isError) && <Text data-testid="debug-bundle-error-text">Your debug bundle was not generated.</Text>}
        {Boolean(canDownload) && (
          <Box data-testid="debug-bundle-complete-box">
            <Flex gap={2}>
              <Text fontWeight="bold">Debug bundle complete:</Text>
              <DebugBundleLink showDatetime={false} statuses={statuses} />
            </Flex>
          </Box>
        )}
      </Box>

      {!isExpired && (
        <Box mt={2}>
          {statuses.length > 0 && <DebugBundleOverview statuses={statuses} />}

          <Box my={2}>
            {isInProgress ? (
              <Button
                data-testid="debug-bundle-stop-button"
                onClick={() => {
                  for (const status of statuses) {
                    if (status.value.case === 'bundleStatus') {
                      api.cancelDebugBundleProcess({ jobId: status.value.value.jobId }).catch(() => {
                        // Error handling managed by API layer
                      });
                    }
                  }
                }}
                variant="outline"
              >
                Stop
              </Button>
            ) : (
              <Button
                as={Link}
                data-testid={isError ? 'debug-bundle-try-again-button' : 'debug-bundle-done-button'}
                to="/debug-bundle"
                variant="outline"
              >
                {isError ? 'Try again' : 'Done'}
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
