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

import React, { ReactNode, Component, CSSProperties } from "react";


class Card extends Component<{ id?: string, style?: CSSProperties, className?: string }> {

    render() {
        return <div id={this.props.id} className={'kowlCard ' + (this.props.className ?? '')} style={this.props.style}>
            {this.props.children}
        </div>
    }
}

export default Card;
