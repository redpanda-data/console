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

import { Button } from 'components/redpanda-ui/components/button';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { appGlobal } from '../../../../state/app-global';
import { api, REST_CACHE_DURATION_SEC } from '../../../../state/backend-api';
import { prettyMilliseconds } from '../../../../utils/utils';

const AUTO_REFRESH_INTERVAL_SECS = 10;

export const DataRefreshButton = () => {
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
        const timeUntilRefresh = stateRef.current.nextRefresh - Date.now();
        if (timeUntilRefresh > 0) {
          newRemainingSeconds = Math.ceil(timeUntilRefresh / 1000);
        } else {
          stateRef.current.nextRefresh = Date.now() + AUTO_REFRESH_INTERVAL_SECS * 1000;
          appGlobal.onRefresh();
        }
      } else if (stateRef.current.isActive && currentRequests > 0) {
        // Active requests — delay the next refresh
        stateRef.current.nextRefresh = Date.now() + AUTO_REFRESH_INTERVAL_SECS * 1000;
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
      stateRef.current.nextRefresh = Date.now() + AUTO_REFRESH_INTERVAL_SECS * 1000;
    } else {
      appGlobal.onRefresh();
    }
    setIsActive(newActive);
  };

  const countStr = maxRequestCount > 1 ? `${maxRequestCount - activeRequests} / ${maxRequestCount}` : '';

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              // Size variants also set `[&_svg]:size-*`, so a box size from className alone would
              // leave the glyph oversized.
              <Button
                aria-label={isActive ? 'Pause auto refresh' : 'Start auto refresh'}
                onClick={toggleAutorefresh}
                size="icon-sm"
                variant="ghost"
              >
                {isActive ? <Pause /> : <Play />}
              </Button>
            }
          />
          <TooltipContent className="max-w-56">
            <div className="flex flex-col gap-1">
              <span className="font-medium">Auto refresh</span>
              <span>Automatically refresh the data on this page every {AUTO_REFRESH_INTERVAL_SECS}s.</span>
            </div>
          </TooltipContent>
        </Tooltip>
        {isActive || activeRequests > 0 ? (
          <Spinner className="ml-1" />
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button aria-label="Force refresh" onClick={() => appGlobal.onRefresh()} size="icon-sm" variant="ghost">
                  <RefreshCw />
                </Button>
              }
            />
            <TooltipContent className="max-w-64">
              <div className="flex flex-col gap-1">
                <span className="font-medium">Force refresh</span>
                <span>
                  Refresh the data shown on this page. When switching pages, any data older than{' '}
                  {prettyMilliseconds(REST_CACHE_DURATION_SEC * 1000)} is refreshed automatically.
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
        <span className="ml-3 select-none text-body text-muted-foreground">
          {isActive && activeRequests === 0 ? <>Refreshing in {remainingSeconds} secs</> : null}
          {activeRequests > 0 ? <>Fetching data... {countStr}</> : null}
        </span>
      </div>
    </TooltipProvider>
  );
};

export default DataRefreshButton;
