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
import { uiSettings } from '../../../../state/ui';
import { prettyNumber } from '../../../../utils/utils';
import '../../../../utils/numberExtensions';
import { Slider, SliderFilledTrack, SliderMark, SliderThumb, SliderTrack, Tooltip } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';

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

const labelStyles = {
    mt: '1',
    mb: '2',
    ml: '-2',
    fontSize: 'sm',
}

export class BandwidthSlider extends Component<ValueAndChangeCallback | { settings: BindableSettings }> {

    @observable isDragging = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        const value = this.value ?? 0;
        const sliderValue = Math.log10(value);

        const tipText = (f: number | null) => {
            if (f == null) return null;
            if (f < 3) return 'No change';
            if (f > 12) return 'Unlimited';
            const v = Math.round(Math.pow(10, f.clamp(3, 12)));
            return prettyNumber(v).toUpperCase() + 'B/s';
        }

        return <Slider
            min={2} max={12.1} step={0.1}
            value={sliderValue}
            onChange={(n: number) => {
                switch (true) {
                    case n < 2.5:
                        this.value = null;
                        return;
                    // case n > 12.5:
                    //     this.value = Number.POSITIVE_INFINITY; return;
                    default:
                        this.value = Math.round(Math.pow(10, n.clamp(3, 12)));
                        return;
                }
            }}
            mt="6" mx="4" mb="4"
            onMouseEnter={() => this.isDragging = true}
            onMouseLeave={() => this.isDragging = false}
        >
            <SliderMark value={2} {...labelStyles}>-</SliderMark>
            <SliderMark value={3} {...labelStyles}>1kB</SliderMark>
            <SliderMark value={6} {...labelStyles}>1MB</SliderMark>
            <SliderMark value={9} {...labelStyles}>1GB</SliderMark>
            <SliderMark value={12} {...labelStyles}>1TB</SliderMark>

            <SliderTrack>
                <SliderFilledTrack />
            </SliderTrack>

            <Tooltip
                hasArrow
                bg="hsl(0 0% 30%)"
                color="white"
                placement="top"
                isOpen={this.isDragging}
                label={tipText(sliderValue)}
            >
                <SliderThumb />
            </Tooltip>
        </Slider>
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
