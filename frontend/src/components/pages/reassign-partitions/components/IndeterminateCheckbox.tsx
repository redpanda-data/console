import React, { Component } from "react";
import { observer } from "mobx-react";


@observer
export class IndeterminateCheckbox extends Component<{ originalCheckbox: React.ReactNode; getCheckState: () => { checked: boolean; indeterminate: boolean; }; }> {

    render() {
        const state = this.props.getCheckState();
        // console.log(`checkbox${index} props: ${(originNode as any).props?.indeterminate}`)
        const clone = React.cloneElement(this.props.originalCheckbox as any, {
            checked: state.checked,
            indeterminate: state.indeterminate,
        });
        return clone;
    }
}
