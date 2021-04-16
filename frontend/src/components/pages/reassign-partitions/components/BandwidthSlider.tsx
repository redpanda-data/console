import { Slider } from "antd";
import React, { Component } from "react";
import { uiSettings } from "../../../../state/ui";
import { prettyBytesOrNA } from "../../../../utils/utils";

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

    get value(): number {
        if ('value' in this.props) return this.props.value;
        else return this.props.settings.maxReplicationTraffic;
    }

    set value(x: number) {
        if ('value' in this.props) this.props.onChange(x);
        else this.props.settings.maxReplicationTraffic = x;
    }

    render() {
        return <Slider style={{ minWidth: '300px', margin: '0 1em', paddingBottom: '2em', flex: 1 }}
            min={2} max={12} step={0.1}
            marks={{ 2: "Off", 3: "1kB", 6: "1MB", 9: "1GB", 12: "1TB", }}
            included={true}
            tipFormatter={f => this.value < 1000
                ? 'No limit'
                : prettyBytesOrNA(this.value) + '/s'}

            value={Math.log10(this.value)}
            onChange={sv => {
                const n = Number(sv.valueOf());
                const newLimit = Math.pow(10, n);
                if (newLimit >= 1000) {
                    this.value = newLimit;
                }
                else {
                    if (newLimit < 500)
                        this.value = 0;
                    else this.value = 1000;
                }
            }}
        />
    }
}