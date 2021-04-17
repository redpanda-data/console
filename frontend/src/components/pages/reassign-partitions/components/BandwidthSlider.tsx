import { Slider } from "antd";
import React, { Component } from "react";
import { uiSettings } from "../../../../state/ui";
import { prettyBytesOrNA } from "../../../../utils/utils";
import '../../../../utils/numberExtensions';

//
// BandwidthSlider can work with two kinds of inputs
// 1) Simple 'controlled state'
//    You pass a 'value' and 'onChange' callback.
// 2) A settings object (that is supposed to be a mobx observable)
//    in which a 'maxReplicationTraffic' property exists.
//    The property will be directly read from / written to.
//
type ValueAndChangeCallback = { value: number, onChange: (x: number) => void };
type BindableSettings = Pick<typeof uiSettings.reassignment, 'maxReplicationTraffic'>;

export class BandwidthSlider extends Component<ValueAndChangeCallback | { settings: BindableSettings }> {

    render() {
        return <Slider style={{ minWidth: '300px', margin: '0 1em', paddingBottom: '2em', flex: 1 }}
            min={2} max={12} step={0.1}
            marks={{
                2: "-",
                3: "1kB", 6: "1MB", 9: "1GB", 12: "1TB",
                // 13: "∞"
            }}
            included={true}
            tipFormatter={f => f < 3
                ? 'No change'
                : f > 12
                    ? 'Unlimited'
                    : prettyBytesOrNA(this.value) + '/s'}

            value={Math.log10(this.value)}
            onChange={sv => {
                let n = Number(sv.valueOf());

                switch (true) {
                    case n < 2.5:
                        this.value = 0; return;
                    // case n > 12.5:
                    //     this.value = Number.POSITIVE_INFINITY; return;
                    default:
                        this.value = Math.pow(10, n.clamp(3, 12)); return;
                }
            }}
        />
    }

    get value(): number {
        if ('value' in this.props) return this.props.value;
        else return this.props.settings.maxReplicationTraffic;
    }

    set value(x: number) {
        if ('value' in this.props) this.props.onChange(x);
        else this.props.settings.maxReplicationTraffic = x;
    }
}