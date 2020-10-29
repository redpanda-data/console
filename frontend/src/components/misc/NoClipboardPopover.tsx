import { Popover } from 'antd';
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
}> = ({ children }) =>
    isClipboardAvailable ? (
        <>{children}</>
    ) : (
        <Popover title="Clipboard unavailable" content={popoverContent} arrowPointAtCenter={true}>
            {children}
        </Popover>
    );
