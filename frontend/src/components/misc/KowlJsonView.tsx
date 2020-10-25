import React from 'react';
import JsonView, { ReactJsonViewProps } from 'react-json-view';

export function KowlJsonView(props: ReactJsonViewProps) {
    const { style, ...restProps } = props;
    const mergedStyles = Object.assign({ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }, style);
    return (
        <JsonView
            style={mergedStyles}
            displayDataTypes={false}
            displayObjectSize={true}
            enableClipboard={false}
            name={null}
            collapseStringsAfterLength={40}
            groupArraysAfterLength={100}
            indentWidth={5}
            iconStyle="triangle"
            collapsed={2}
            {...restProps}
        />
    );
}
