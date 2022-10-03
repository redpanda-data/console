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
import { observer } from 'mobx-react';


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
