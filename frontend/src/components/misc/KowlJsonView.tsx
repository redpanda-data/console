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

import { message } from 'antd';
import { observer } from 'mobx-react';
import React, { useEffect } from 'react';
import JsonView, { ReactJsonViewProps } from '@textea/json-viewer';
import { uiSettings } from '../../state/ui';
import { Tooltip, useDisclosure } from '@redpanda-data/ui';
import styles from './KowlJsonView.module.scss';
const { setTimeout } = window;

let ctrlDown = false;
const clickPos = { x: 0, y: 0 };

let timerId = undefined as number | undefined;
const setOrRefreshTimeout = (duration: number, action: () => void) => {
    if (timerId != undefined) clearTimeout(timerId);

    timerId = setTimeout(() => {
        timerId = undefined;
        action();
    }, duration);
};

// Used for  Tooltip modifiers
type TooltipPopperRect = { x: number; y: number; width: number; height: number };

export const KowlJsonView = observer((props: ReactJsonViewProps) => {
    const { style, ...restProps } = props;

    const { isOpen, onOpen, onClose } = useDisclosure();

    const settings = uiSettings.jsonViewer;
    const mergedStyles = Object.assign({ fontSize: settings.fontSize, lineHeight: settings.lineHeight, whiteSpace: 'normal' }, style);

    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        // set keyup/keydown event listeners
        const handleKeyboard = (e: KeyboardEvent) => (ctrlDown = e.ctrlKey);
        document.addEventListener('keydown', handleKeyboard);
        document.addEventListener('keyup', handleKeyboard);

        return () => {
            // clean up keyup/keydown event listeners
            document.removeEventListener('keydown', handleKeyboard);
            document.removeEventListener('keyup', handleKeyboard);
        };
    }, []);

    return (
        <div
            className="copyHintContainer"
            ref={containerRef}
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
                        if (target.parentElement != null) target = target.parentElement; // try parent
                        else return; // no more parents, give up
                    }
                }

                const parentPos = containerRef.current ? containerRef.current.getClientRects()[0] : { x: 0, y: 0 };
                clickPos.x = e.clientX - parentPos.x;
                clickPos.y = e.clientY - parentPos.y;

                onClose();
                setOrRefreshTimeout(1000, () => {
                    onClose();
                });
                onOpen();
            }}
        >
            <Tooltip
                label="CTRL+Click to copy"
                placement="top-start"
                // isDisabled={!isOpen}
                isOpen={isOpen}
                closeOnClick={false}
                hasArrow
                modifiers={[
                    {
                        name: 'offset',
                        options: {
                            offset: ({ popper }: { popper: TooltipPopperRect }) => {
                                // position popper where mouse click occurs
                                const POPPER_OFFSET_TO_CLICK = 16;
                                return [popper.width / 2 + (clickPos.x - popper.width), -(clickPos.y - POPPER_OFFSET_TO_CLICK)];
                            }
                        }
                    },
                    {
                        name: 'arrow',
                        options: {
                            padding: ({ popper }: { popper: TooltipPopperRect }) => {
                                const ARROW_SIZE = 5;
                                // position arrow in center of popper
                                return popper.width / 2 - ARROW_SIZE;
                            }
                        }
                    }
                ]}
            >
                <div>
                    <JsonView
                        style={mergedStyles}
                        displayDataTypes={false}
                        displayObjectSize={true}
                        enableClipboard={false}
                        name={null}
                        collapseStringsAfterLength={settings.maxStringLength}
                        groupArraysAfterLength={100}
                        indentWidth={5}
                        iconStyle="triangle"
                        collapsed={settings.collapsed}
                        onSelect={e => {
                            if (ctrlDown) {
                                if (navigator?.clipboard) {
                                    navigator.clipboard.writeText(String(e.value));
                                    message.success(
                                        <span>
                                            Copied value of <span className="codeBox">{e.name}</span>
                                        </span>,
                                        0.8
                                    );
                                }
                            }
                        }}
                        {...restProps}
                    />
                </div>
            </Tooltip>
        </div>
    );
});
