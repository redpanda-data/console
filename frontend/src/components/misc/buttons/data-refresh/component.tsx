import { Box, Flex, IconButton, Popover, Spinner, Text } from '@redpanda-data/ui';
import { PauseIcon, PlayIcon, RefreshIcon } from 'components/icons';
import { autorun, observable } from 'mobx';
import { observer } from 'mobx-react';

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

import { appGlobal } from '../../../../state/app-global';
import { api, REST_CACHE_DURATION_SEC } from '../../../../state/backend-api';
import { uiSettings } from '../../../../state/ui';
import { prettyMilliseconds } from '../../../../utils/utils';

const autoRefresh = observable(
  {
    active: false,
    timerId: undefined as ReturnType<typeof setInterval> | undefined,
    maxRequestCount: 0,
    nextRefresh: Number.POSITIVE_INFINITY,
    remainingSeconds: 0,

    get currentTime() {
      return Date.now();
    },

    toggleAutorefresh() {
      this.active = !this.active;
      if (this.active) {
        // Start
        this.scheduleNextRefresh();
        this.timerId = setInterval(this.updateAutorefresh, 150);
      } else {
        // Stop
        clearInterval(this.timerId);
        appGlobal.onRefresh();
      }
    },

    updateAutorefresh() {
      const timeUntilRefresh = this.nextRefresh - this.currentTime;

      if (api.activeRequests.length > 0) {
        // There are active requests, delay the next refresh / reset the timer
        this.scheduleNextRefresh();
        return;
      }

      if (timeUntilRefresh > 0) {
        // Still some time left, only update visual timer
        this.remainingSeconds = Math.ceil(timeUntilRefresh / 1000);
        return;
      }

      // The timer has expired
      // Refresh now and schedule the next refresh...
      this.scheduleNextRefresh();
      appGlobal.onRefresh();
    },

    scheduleNextRefresh() {
      this.nextRefresh = this.currentTime + uiSettings.autoRefreshIntervalSecs * 1000;
    },
  },
  undefined,
  { autoBind: true }
);

autorun(() => {
  const currentRequests = api.activeRequests.length;
  if (currentRequests === 0) {
    autoRefresh.maxRequestCount = 0;
  }
  if (currentRequests > autoRefresh.maxRequestCount) {
    autoRefresh.maxRequestCount = currentRequests;
  }
});

export const DataRefreshButton = observer(() => {
  // Track how many requests we've sent in total
  const countStr =
    autoRefresh.maxRequestCount > 1
      ? `${autoRefresh.maxRequestCount - api.activeRequests.length} / ${autoRefresh.maxRequestCount}`
      : '';

  // maybe we need to use the same 'no vertical expansion' trick:
  return (
    <div className="flex items-center gap-1">
      <Box>
        <Popover
          content={
            <div>
              Enable or disable automatic refresh every{' '}
              <span className="codeBox">{uiSettings.autoRefreshIntervalSecs}s</span>.
            </div>
          }
          hideCloseButton={true}
          isInPortal
          placement="bottom"
          title="Auto Refresh"
        >
          <IconButton
            aria-label="Auth Refresh"
            icon={autoRefresh.active ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
            onClick={autoRefresh.toggleAutorefresh}
            p={0}
            size="xs"
            variant="ghost"
          />
        </Popover>
      </Box>
      <Flex alignItems="center" flexDirection="column">
        {autoRefresh.active || api.activeRequests.length > 0 ? (
          <Spinner color="red.500" ml={2} size="sm" speed="0.3s" />
        ) : (
          <Popover
            content={
              <div>
                Click to force a refresh of the data shown in the current page. When switching pages, any data older
                than <span className="codeBox">{prettyMilliseconds(REST_CACHE_DURATION_SEC * 1000)}</span> will be
                refreshed automatically.
              </div>
            }
            hideCloseButton={true}
            isInPortal
            placement="bottom"
            title="Force Refresh"
          >
            <IconButton
              aria-label="Force Refresh"
              icon={<RefreshIcon size={18} />}
              onClick={() => appGlobal.onRefresh()}
              p={0}
              size="xs"
              variant="ghost"
            />
          </Popover>
        )}
      </Flex>
      <Text fontSize="sm" ml={4} userSelect="none">
        {autoRefresh.active && api.activeRequests.length === 0 && (
          <>Refreshing in {autoRefresh.remainingSeconds} secs</>
        )}
        {api.activeRequests.length > 0 && <>Fetching data... {countStr}</>}
      </Text>
    </div>
  );
});

export default DataRefreshButton;
