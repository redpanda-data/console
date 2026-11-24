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

import { Component, type CSSProperties, type ReactNode } from 'react';

export class ZeroSizeWrapper extends Component<{
  width?: string;
  height?: string;
  justifyContent?: string;
  alignItems?: string;
  positionContentAbsolute?: boolean;
  transform?: string;
  wrapperStyle?: CSSProperties;
  children?: ReactNode;
}> {
  static readonly style: CSSProperties = {
    display: 'inline-flex',
    width: '0px',
    height: '0px',
    transform: 'translateY(-0.5px)',
    justifyContent: 'center',
    alignItems: 'center',
  };

  render() {
    const p = this.props;
    let style = ZeroSizeWrapper.style;
    if (p.width || p.height || p.justifyContent || p.alignItems || p.transform || p.wrapperStyle) {
      style = { ...style, ...p, ...p.wrapperStyle };
    }

    return (
      <span className="verticalCenter" style={style}>
        <span style={p.positionContentAbsolute ? { position: 'absolute' } : undefined}>{this.props.children}</span>
      </span>
    );
  }
}
