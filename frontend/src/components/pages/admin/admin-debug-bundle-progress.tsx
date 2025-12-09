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

import { observer } from 'mobx-react';

import { api } from '../../../state/backend-api';
import '../../../utils/array-extensions';
import { Box, Button, Flex, Text } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { Link as ReactRouterLink } from 'react-router-dom';

import DebugBundleOverview from './debug-bundle-overview';
import { appGlobal } from '../../../state/app-global';
import DebugBundleLink from '../../debugBundle/debug-bundle-link';
import { PageComponent, type PageInitHelper } from '../page';

@observer
export default class AdminPageDebugBundleProgress extends PageComponent {
  @observable advancedForm = false;
  @observable submitInProgress = false;

  @observable jobId: string | undefined = undefined;

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

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
  }

  render() {
    return (
      <Box>
        <Text data-testid="debug-bundle-description">
          Collect environment data that can help debug and diagnose issues with a Redpanda cluster, a broker, or the
          machine it's running on. This will bundle the collected data into a ZIP file.
        </Text>

        <Box mt={4}>
          {api.isDebugBundleInProgress && <Text data-testid="debug-bundle-generating-text">Generating bundle...</Text>}
          {api.isDebugBundleExpired && (
            <Text data-testid="debug-bundle-expired-text" fontWeight="bold">
              Your previous bundle has expired and cannot be downloaded.
            </Text>
          )}
          {api.isDebugBundleError && (
            <Text data-testid="debug-bundle-error-text">Your debug bundle was not generated.</Text>
          )}
          {api.canDownloadDebugBundle && (
            <Box data-testid="debug-bundle-complete-box">
              <Flex gap={2}>
                <Text fontWeight="bold">Debug bundle complete:</Text>
                <DebugBundleLink showDatetime={false} statuses={api.debugBundleStatuses} />
              </Flex>
            </Box>
          )}
        </Box>

        {!api.isDebugBundleExpired && (
          <Box mt={2}>
            {api.debugBundleStatuses && <DebugBundleOverview statuses={api.debugBundleStatuses} />}

            <Box my={2}>
              {api.isDebugBundleInProgress ? (
                <Button
                  data-testid="debug-bundle-stop-button"
                  onClick={() => {
                    for (const status of api.debugBundleStatuses) {
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
                  as={ReactRouterLink}
                  data-testid={api.isDebugBundleError ? 'debug-bundle-try-again-button' : 'debug-bundle-done-button'}
                  to="/debug-bundle"
                  variant="outline"
                >
                  {api.isDebugBundleError ? 'Try again' : 'Done'}
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>
    );
  }
}
