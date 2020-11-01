import { Popover } from 'antd';
import { PopoverProps } from 'antd/lib/popover';
import React, { FunctionComponent, ReactElement } from 'react';
import { isClipboardAvailable } from '../../utils/featureDetection';

const popoverContent = (
    <>
        <p>Due to browser restrictions, the clipboard is not accessible on unsecure connections.</p>
        <p>Please make sure to run Kowl with SSL enabled to use this feature.</p>
    </>
);

export const NoClipboardPopover: FunctionComponent<{
    children: ReactElement;
    placement?: 'left'|'top'
}> = ({ children, placement = 'top' }) =>
    isClipboardAvailable ? (
        <>{children}</>
    ) : (
        <Popover title="Clipboard unavailable" content={popoverContent} arrowPointAtCenter={true} placement={placement}>
            {children}
        </Popover>
    );
