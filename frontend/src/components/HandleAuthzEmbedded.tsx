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
import { PropsWithChildren } from 'react';
import { Route, Switch } from 'react-router-dom';
import ErrorPage from './misc/Error401Page';

const EnsureAuth = observer(({ children }: PropsWithChildren) => {
    return (
        <>
            <Switch>
                {/* unauthorized (and callbacks) */}
                <Route exact path="/unauthorized" component={ErrorPage} />
                {/* Default View */}
                {children}
            </Switch>
        </>
    );
});

export default EnsureAuth;

