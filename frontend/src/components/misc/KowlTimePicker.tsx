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

import { Component } from 'react';
import React from 'react';
import { observer } from 'mobx-react';
import { makeObservable, observable } from 'mobx';
import { Box, DateTimeInput } from '@redpanda-data/ui';

@observer
export class KowlTimePicker extends Component<{
    valueUtcMs: number;
    onChange: (utcMs: number) => void;
    disabled?: boolean;
}> {
    @observable isLocalTimeMode = false;
    @observable timestampUtcMs: number = new Date().valueOf();

    constructor(p: any) {
        super(p);
        this.timestampUtcMs = this.props.valueUtcMs;
        makeObservable(this);
    }

    render() {
        return (
            <Box maxW={300}>
                <DateTimeInput
                    value={this.timestampUtcMs}
                    onChange={(value) => {
                        this.timestampUtcMs = value
                        this.props.onChange(this.timestampUtcMs)
                    }}
                />
            </Box>
        );
    }
}
