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

import { Modal, ModalProps as AntdModalProps, Result } from 'antd';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import React from 'react';
import { toJson } from './jsonUtils';
import { Button } from '@redpanda-data/ui';

export type AutoModalProps = Omit<AntdModalProps, 'visible' | 'onCancel' | 'onOk' | 'afterClose' | 'modalRender'> & {
    // skipSuccess?: boolean,
    successTitle?: string,
};

export type AutoModal<TArg> = {
    show: (arg: TArg) => void;
    Component: () => JSX.Element;
}

// Create a wrapper for <Modal/>  takes care of rendering depending on 'visible'
// - keeps rendering the modal until its close animation is actually finished
// - automatically renders content for states like 'Loading' (disable controls etc) or 'Error' (display error and allow trying again)
export default function createAutoModal<TShowArg, TModalState>(options: {
    modalProps: AutoModalProps,
    // called when the returned 'show()' method is called.
    // Return the state for your modal here
    onCreate: (arg: TShowArg) => TModalState,
    // return the component that will handle editting the modal-state (that you returned from 'onCreate')
    content: (state: TModalState) => React.ReactElement,
    // called when the user clicks the Ok button; do network requests in here
    // return some JSX (or null) to show the success page, or throw an error if anything went wrong to show the error page
    onOk: (state: TModalState) => Promise<JSX.Element | undefined>,
    // used to determine whether or not the 'ok' button is enabled
    isOkEnabled?: (state: TModalState) => boolean,
    // called when 'onOk' has returned (and not thrown an exception)
    onSuccess?: (state: TModalState, result: any) => void,
    // called when the user clicks 'Close'. When the user clicks 'Ok', the 'onOk' handler is called, and once it returns (without throwing any errors) the dialog is
    // considered to be in the 'success' state (where the return of onOk is shown, stuff like "Successfully created XYZ entries"), the only remaining available button is "Close",
    // and once the user clicks it 'onComplete' will be called.
    onComplete?: (state: TModalState) => void,

}): AutoModal<TShowArg> {

    let userState: TModalState | undefined = undefined;
    const state = observable({
        modalProps: null as AntdModalProps | null,
        visible: false,
        loading: false,
        result: null as null | { error?: any, returnValue?: JSX.Element; },
    }, undefined, { defaultDecorator: observable.ref });

    // Called by user to create a new modal instance
    const show = action((arg: TShowArg) => {
        userState = options.onCreate(arg);
        state.modalProps = Object.assign({}, options.modalProps, {
            onCancel: () => {
                state.visible = false;
                state.result = null;
            },
            onOk: async () => {
                if (state.result?.error) {
                    // Error -> Clear
                    state.result = null;
                    return;
                }

                try {
                    state.loading = true;
                    state.result = {
                        returnValue: await options.onOk(userState!) ?? undefined,
                        error: null,
                    };
                } catch (e) {
                    state.result = { error: e };
                }
                finally {
                    state.loading = false;
                }

                if (state.result && !state.result.error)
                    options.onSuccess?.(userState!, state.result.returnValue);
            },
            afterClose: () => {
                state.modalProps = null;
                state.result = null;
                state.visible = false;
                state.loading = false;
            },
        });
        state.visible = true;
    });

    const renderError = (err: any) => {
        let content;
        let title = 'Error';
        const codeBoxStyle = { fontSize: '12px', fontFamily: 'monospace', color: 'hsl(0deg 0% 25%)', margin: '0em 1em' };

        if (React.isValidElement(err))
            // JSX
            content = err;
        else if (typeof err === 'string')
            // String
            content = <div style={codeBoxStyle}>{err}</div>;
        else if (err instanceof Error) {
            // Error
            title = err.name;
            content = <div style={codeBoxStyle}>{err.message}</div>;
        }
        else {
            // Object
            content = <div style={codeBoxStyle}>
                {toJson(err, 4)}
            </div>;
        }

        return <Result style={{ margin: 0, padding: 0, marginTop: '1em' }} status="error"
            title={title}
        >
            {content}
        </Result>
    };

    const renderSuccess = (response: JSX.Element | null | undefined) => {
        const onSuccessClose = () => {
            state.visible = false;
            options.onComplete?.(userState!);
        };

        return <>
            <Result style={{ margin: 0, padding: 0, marginTop: '1em' }} status="success"
                title={options.modalProps.successTitle ?? 'Success'}
                subTitle={response}
                extra={<Button variant="solid" colorScheme="brand" size="lg" style={{ width: '16rem' }} onClick={onSuccessClose}>Close</Button>}
            />
        </>;
    };

    // The component the user uses to render/mount into the jsx tree
    const Component = observer(() => {
        if (!state.modalProps) return <></>;

        let content: JSX.Element;
        let isOkEnabled = true;
        let buttonProps: AntdModalProps;

        if (state.result) {
            if (state.result.error) {
                // Error
                content = renderError(state.result.error);
                buttonProps = propsOnError;
            } else {
                // Success
                content = renderSuccess(state.result.returnValue);
                buttonProps = propsOnSuccess;
            }
        } else {
            // Normal
            content = options.content(userState!);
            isOkEnabled = options.isOkEnabled?.(userState!) ?? true;
            buttonProps = { okButtonProps: { disabled: !isOkEnabled } };
        }

        return <Modal {...state.modalProps} {...buttonProps} open={state.visible} confirmLoading={state.loading}>
            {content}
        </Modal>;
    });

    return { show, Component };
}

const styleHidden = { style: { display: 'none' } };
const propsOnError = { cancelButtonProps: styleHidden, okText: 'Back' } as AntdModalProps;
const propsOnSuccess = { footer: null, title: null } as AntdModalProps; //  cancelButtonProps: styleHidden, okButtonProps: styleHidden,
