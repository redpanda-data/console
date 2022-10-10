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
import { Button, Popover } from 'antd';
import { observer } from 'mobx-react';
import { ReactNode, useEffect, useState } from 'react';
import { appGlobal } from '../../../../state/appGlobal';
import { api, REST_CACHE_DURATION_SEC } from '../../../../state/backendApi';
import { prettyMilliseconds } from '../../../../utils/utils';
import styles from '../buttons.module.scss';

export const DataRefreshButton = observer(() => {
    const [lastRequestCount, setLastRequestCount] = useState(0);

    useEffect(() => {
         if (api.activeRequests.length == 0) setLastRequestCount(0);
        else setLastRequestCount(Math.max(lastRequestCount, api.activeRequests.length));
    }, [lastRequestCount])

    const spinnerSize = '16px';
    const refreshTextFunc = (): ReactNode => {
        return <div style={{ maxWidth: '350px' }}>
            Click to force a refresh of the data shown in the current page.
            When switching pages, any data older than <span className="codeBox">{prettyMilliseconds(REST_CACHE_DURATION_SEC * 1000)}</span> will be refreshed automatically.
        </div>;
        // TODO: small table that shows what cached data we have and how old it is
    };


    // Track how many requests we've sent in total
       const countStr = lastRequestCount > 1
        ? `${lastRequestCount - api.activeRequests.length} / ${lastRequestCount}`
        : '';

    // maybe we need to use the same 'no vertical expansion' trick:
    return <div className={styles.dataRefreshButton}>
        {
        api.activeRequests.length == 0
            ?
            <>
                <Popover title="Force Refresh" content={refreshTextFunc} placement="rightTop" overlayClassName="popoverSmall" >
                    <Button icon={< SyncIcon size={16} />} shape="circle" className={styles.hoverButton} onClick={() => appGlobal.onRefresh()} />
                </Popover>
                {/* <span style={{ paddingLeft: '.2em', fontSize: '80%' }}>fetched <b>1 min</b> ago</span> */}
            </>
            :
            <>
                <span className={styles.spinner} style={{ marginLeft: '8px', width: spinnerSize, height: spinnerSize }} />
                <span className={styles.pulsating} style={{ padding: '0 10px', fontSize: '80%', userSelect: 'none' }}>Fetching data... {countStr}</span>
            </>
    }
    </div>;
});

export default DataRefreshButton;
