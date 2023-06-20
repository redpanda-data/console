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
import { SyncIcon } from '@primer/octicons-react';
import { MdPause, MdPlayCircleOutline } from 'react-icons/md';
import { Popover } from 'antd';
import { Button, Icon } from '@redpanda-data/ui';
import { autorun, observable } from 'mobx';
import { observer } from 'mobx-react';
import { ReactNode } from 'react';
import { appGlobal } from '../../../../state/appGlobal';
import { api, REST_CACHE_DURATION_SEC } from '../../../../state/backendApi';
import { uiSettings } from '../../../../state/ui';
import { prettyMilliseconds } from '../../../../utils/utils';
import styles from '../buttons.module.scss';


const autoRefresh = observable({
    active: false,
    timerId: undefined as any,
    maxRequestCount: 0,
    nextRefresh: Number.POSITIVE_INFINITY,
    remainingSeconds: 0,

    get currentTime() {
        return new Date().getTime();
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
        this.nextRefresh = this.currentTime + (uiSettings.autoRefreshIntervalSecs * 1000);
    }
}, undefined, { autoBind: true });

autorun(() => {
    const currentRequests = api.activeRequests.length;
    if (currentRequests == 0) {
        autoRefresh.maxRequestCount = 0;
    }
    if (currentRequests > autoRefresh.maxRequestCount) {
        autoRefresh.maxRequestCount = currentRequests;
    }
});

export const DataRefreshButton = observer(() => {

    const spinnerSize = '16px';
    const refreshTextFunc = (): ReactNode => {
        return <div style={{ maxWidth: '350px' }}>
            Click to force a refresh of the data shown in the current page.
            When switching pages, any data older than <span className="codeBox">{prettyMilliseconds(REST_CACHE_DURATION_SEC * 1000)}</span> will be refreshed automatically.
        </div>;
        // TODO: small table that shows what cached data we have and how old it is
    };

    const autoRefreshTextFunc = (): ReactNode => {
        return <div style={{ maxWidth: '350px' }}>
            Enable or disable automatic refresh every <span className="codeBox">{uiSettings.autoRefreshIntervalSecs}s</span>.
        </div>;
    };

    // Track how many requests we've sent in total
    const countStr = autoRefresh.maxRequestCount > 1
        ? `${autoRefresh.maxRequestCount - api.activeRequests.length} / ${autoRefresh.maxRequestCount}`
        : '';

    // maybe we need to use the same 'no vertical expansion' trick:
    return <div className={styles.dataRefreshButton}>
        <Popover title="Auto Refresh" content={autoRefreshTextFunc} placement="rightTop" overlayClassName="popoverSmall" >
            <Button
                display="inline-flex" justifyContent="center" alignItems="center"
                width="35px" borderRadius="100px"
                colorScheme="whiteAlpha"
                className={`${styles.hoverButton} ${autoRefresh.active ? styles.pulsating : ''}`}
                onClick={autoRefresh.toggleAutorefresh} >
                {autoRefresh.active
                    ? <Icon as={MdPause} fontSize="16px" />
                    : <Icon as={MdPlayCircleOutline} fontSize="19px" />}
            </Button>
        </Popover>
        {
            (api.activeRequests.length == 0)
                ? <>
                    <Popover title="Force Refresh" content={refreshTextFunc} placement="rightTop" overlayClassName="popoverSmall" >
                        <Button
                            className={`${styles.hoverButton} ${autoRefresh.active ? styles.rotation : ''}`}
                            borderRadius="100px" width="35px"
                            colorScheme="whiteAlpha"
                            onClick={() => appGlobal.onRefresh()} >
                            <SyncIcon size={16} className="flipX" />
                        </Button>
                    </Popover>
                    {autoRefresh.active && <>
                        <span style={{ paddingRight: '10px', fontSize: '80%', userSelect: 'none' }}>Refreshing in {autoRefresh.remainingSeconds} secs</span>
                    </>
                    }
                    {/* <span style={{ paddingLeft: '.2em', fontSize: '80%' }}>fetched <b>1 min</b> ago</span> */}
                </>
                : <>
                    <span className={styles.spinner} style={{ marginLeft: '8px', width: spinnerSize, height: spinnerSize }} />
                    <span className={styles.pulsating} style={{ padding: '0 10px', fontSize: '80%', userSelect: 'none' }}>Fetching data... {countStr}</span>
                </>
        }
    </div>;
});

export default DataRefreshButton;
