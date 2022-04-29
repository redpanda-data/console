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
import { DatePicker, Radio } from 'antd';
import { observer } from 'mobx-react';
import { makeObservable, observable } from 'mobx';
import moment from 'moment';

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
        let format = 'DD.MM.YYYY HH:mm:ss';
        let current: moment.Moment = moment.utc(this.timestampUtcMs);

        if (this.isLocalTimeMode) {
            current = current?.local();
            format += ' [(Local)]';
        } else {
            format += ' [(UTC)]';
        }

        return (
            <DatePicker
                showTime={true}
                allowClear={false}
                renderExtraFooter={() => this.footer()}
                format={format}
                value={current}
                onChange={(e) => {
                    this.timestampUtcMs = e?.valueOf() ?? -1;
                    this.props.onChange(this.timestampUtcMs);
                }}
                onOk={(e) => {
                    this.timestampUtcMs = e.valueOf();
                    this.props.onChange(this.timestampUtcMs);
                }}
                disabled={this.props.disabled}
            />
        );
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
