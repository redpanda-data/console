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

import React, { Component } from 'react';
import { Radio } from 'antd';
import { observer } from 'mobx-react';
import { makeObservable, observable } from 'mobx';
import moment from 'moment';
import { DateTimePicker, Input } from '@redpanda-data/ui';

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
        const current: moment.Moment = moment.utc(this.timestampUtcMs);

        return <DateTimePicker
            customInput={<Input />}
            defaultDate={new Date(this.timestampUtcMs)}
            disabled={this.props.disabled}
            dateFormat="dd.MM.yyyy HH:mm:ss"
            onChange={(value, dateString, timezone) => {
                console.log({value, dateString, timezone})
                this.timestampUtcMs = value?.getTime() ?? -1
                this.props.onChange(this.timestampUtcMs);
            }}
            defaultTimezone={current?.local() ? 'Local' : 'UTC'}
        />
    }

    footer() {
        return (
            <Radio.Group
                value={this.isLocalTimeMode ? 'local' : 'utc'}
                onChange={(e) => {
                    // console.log("date mode changed", { newValue: e.target.value, isLocalMode: this.isLocalTimeMode });
                    this.isLocalTimeMode = e.target.value == 'local';
                }}
            >
                <Radio value="local">Local</Radio>
                <Radio value="utc">UTC</Radio>
            </Radio.Group>
        );
    }
}
