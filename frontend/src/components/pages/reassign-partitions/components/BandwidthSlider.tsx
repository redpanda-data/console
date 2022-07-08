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

import { Slider } from 'antd';
import React, { Component } from 'react';
import { uiSettings } from '../../../../state/ui';
import { prettyBytesOrNA } from '../../../../utils/utils';
import '../../../../utils/numberExtensions';

//
// BandwidthSlider can work with two kinds of inputs
// 1) Simple 'controlled state'
//    You pass a 'value' and 'onChange' callback.
// 2) A settings object (that is supposed to be a mobx observable)
//    in which a 'maxReplicationTraffic' property exists.
//    The property will be directly read from / written to.
//
type ValueAndChangeCallback = { value: number | null, onChange: (x: number | null) => void };
type BindableSettings = Pick<typeof uiSettings.reassignment, 'maxReplicationTraffic'>;

export class BandwidthSlider extends Component<ValueAndChangeCallback | { settings: BindableSettings }> {

    render() {
        const value = this.value ?? 0;

        return <Slider style={{ minWidth: '300px', margin: '0 1em', paddingBottom: '2em', flex: 1 }}
            min={2} max={12} step={0.1}
            marks={{
                2: '-',
                3: '1kB', 6: '1MB', 9: '1GB', 12: '1TB',
            }}
            included={true}
            tipFormatter={f => {
                if (f == null) return null;
                if (f < 3) return 'No change';
                if (f > 12) return 'Unlimited';
                const v = Math.round(Math.pow(10, f.clamp(3, 12)));
                return prettyBytesOrNA(v) + '/s';
            }}

            value={Math.log10(value)}
            onChange={(n: number) => {
                switch (true) {
                    case n < 2.5:
                        this.value = null; return;
                    // case n > 12.5:
                    //     this.value = Number.POSITIVE_INFINITY; return;
                    default:
                        this.value = Math.round(Math.pow(10, n.clamp(3, 12))); return;
                }
            }}
        />
    }

    get value(): number | null {
        if ('value' in this.props) return this.props.value;
        else return this.props.settings.maxReplicationTraffic;
    }

    set value(x: number | null) {
        if ('value' in this.props) this.props.onChange(x);
        else this.props.settings.maxReplicationTraffic = x;
    }
}
