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

import { Box, Flex, IconButton, Popover, Spinner, Text } from '@redpanda-data/ui';
import { useQueryClient } from '@tanstack/react-query';
import { PauseIcon, PlayIcon, RefreshIcon } from 'components/icons';
import { useEffect, useRef, useState } from 'react';

import { appGlobal } from '../../../../state/app-global';
import { api, REST_CACHE_DURATION_SEC } from '../../../../state/backend-api';
import { uiSettings } from '../../../../state/ui';
import { prettyMilliseconds } from '../../../../utils/utils';

export const DataRefreshButton = () => {
  const queryClient = useQueryClient();
  const [isActive, setIsActive] = useState(false);
  const [refreshState, setRefreshState] = useState({ remainingSeconds: 0, activeRequests: 0, maxRequestCount: 0 });
  const { remainingSeconds, activeRequests, maxRequestCount } = refreshState;

  const stateRef = useRef({
    isActive: false,
    nextRefresh: Number.POSITIVE_INFINITY,
    maxRequestCount: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const currentRequests = api.activeRequests.length;

      // Track max request count
      if (currentRequests === 0) {
        stateRef.current.maxRequestCount = 0;
      } else if (currentRequests > stateRef.current.maxRequestCount) {
        stateRef.current.maxRequestCount = currentRequests;
      }

      let newRemainingSeconds = 0;
      if (stateRef.current.isActive && currentRequests === 0) {
        if (currentRequests > 0) {
          // Active requests — delay the next refresh
          stateRef.current.nextRefresh = Date.now() + uiSettings.autoRefreshIntervalSecs * 1000;
        } else {
          const timeUntilRefresh = stateRef.current.nextRefresh - Date.now();
          if (timeUntilRefresh > 0) {
            newRemainingSeconds = Math.ceil(timeUntilRefresh / 1000);
          } else {
            stateRef.current.nextRefresh = Date.now() + uiSettings.autoRefreshIntervalSecs * 1000;
            appGlobal.onRefresh();
            queryClient.invalidateQueries();
          }
        }
      } else if (stateRef.current.isActive && currentRequests > 0) {
        stateRef.current.nextRefresh = Date.now() + uiSettings.autoRefreshIntervalSecs * 1000;
      }

      setRefreshState({
        activeRequests: currentRequests,
        maxRequestCount: stateRef.current.maxRequestCount,
        remainingSeconds: newRemainingSeconds,
      });
    }, 150);

    return () => clearInterval(interval);
  }, []);

  const toggleAutorefresh = () => {
    const newActive = !stateRef.current.isActive;
    stateRef.current.isActive = newActive;
    if (newActive) {
      stateRef.current.nextRefresh = Date.now() + uiSettings.autoRefreshIntervalSecs * 1000;
    } else {
      appGlobal.onRefresh();
      queryClient.invalidateQueries();
    }
    setIsActive(newActive);
  };

  const countStr = maxRequestCount > 1 ? `${maxRequestCount - activeRequests} / ${maxRequestCount}` : '';

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
            icon={isActive ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
            onClick={toggleAutorefresh}
            p={0}
            size="xs"
            variant="ghost"
          />
        </Popover>
      </Box>
      <Flex alignItems="center" flexDirection="column">
        {isActive || activeRequests > 0 ? (
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
              onClick={() => {
                appGlobal.onRefresh();
                queryClient.invalidateQueries();
              }}
              p={0}
              size="xs"
              variant="ghost"
            />
          </Popover>
        )}
      </Flex>
      <Text fontSize="sm" ml={4} userSelect="none">
        {isActive && activeRequests === 0 && <>Refreshing in {remainingSeconds} secs</>}
        {activeRequests > 0 && <>Fetching data... {countStr}</>}
      </Text>
    </div>
  );
};

export default DataRefreshButton;
