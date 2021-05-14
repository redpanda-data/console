import { message, Tooltip } from 'antd';
import React, { useState } from 'react';
import JsonView, { ReactJsonViewProps } from 'react-json-view';
import { findPopupContainer } from '../../utils/tsxUtils';
import styles from './KowlJsonView.module.scss';
const { setTimeout } = window;

let ctrlDown = false;
document.addEventListener('keydown', e => ctrlDown = e.ctrlKey);
document.addEventListener('keyup', e => ctrlDown = e.ctrlKey);

const clickPos = { x: 0, y: 0 };

let timerId = undefined as number | undefined;
const setOrRefreshTimeout = (duration: number, action: () => void) => {
    if (timerId != undefined)
        clearTimeout(timerId);

    timerId = setTimeout(() => {
        timerId = undefined;
        action();
    }, duration);
}

export const KowlJsonView = (props: ReactJsonViewProps) => {
    const { style, ...restProps } = props;
    const mergedStyles = Object.assign({ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }, style);

    const [visible, setVisible] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    return (
        <div className="copyHintContainer" ref={containerRef}
            onMouseDownCapture={e => {

                if (e.ctrlKey) {
                    // copy
                    return;
                }

                // Show hint

                // Find parent "div.variable-value"
                // can be either the actual target (numbers), or a parent (strings, but only sometimes)
                let target = e.target as Element;
                if (target instanceof Element) {
                    while (!target.classList.contains('variable-value')) {
                        if (target.parentElement != null)
                            target = target.parentElement; // try parent
                        else
                            return; // no more parents, give up
                    }
                }

                const parentPos = containerRef.current ? containerRef.current.getClientRects()[0] : { x: 0, y: 0 };
                clickPos.x = e.clientX - parentPos.x;
                clickPos.y = e.clientY - parentPos.y;

                setVisible(false);
                setOrRefreshTimeout(1000, () => {
                    setVisible(false);
                });
                setVisible(true);

            }}>
            <Tooltip overlay="CTRL+Click to copy" visible={visible}
                overlayClassName={styles.tooltipTransformFix}
                getPopupContainer={x => containerRef.current ?? x}
                align={{
                    points: ['bc', 'tc'],
                    targetOffset: ['50%', '0%'] as unknown as any,
                    offset: [clickPos.x, clickPos.y - 6],
                    overflow: { adjustX: false, adjustY: false }
                }}
            >
                <JsonView
                    style={mergedStyles}
                    displayDataTypes={false}
                    displayObjectSize={true}
                    enableClipboard={false}
                    name={null}
                    collapseStringsAfterLength={200}
                    groupArraysAfterLength={100}
                    indentWidth={5}
                    iconStyle="triangle"
                    collapsed={2}
                    onSelect={e => {
                        if (ctrlDown) {
                            if (navigator?.clipboard) {
                                navigator.clipboard.writeText(String(e.value));
                                message.success(<span>Copied value of <span className='codeBox'>{e.name}</span></span>, 0.8);
                            }
                        }
                    }}
                    {...restProps}
                />
            </Tooltip>
        </div>
    );
}
