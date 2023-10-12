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

import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import React, { CSSProperties, ReactElement } from 'react';
import { toJson } from './jsonUtils';
import { Box, Button, Flex, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Result, VStack } from '@redpanda-data/ui';

export type AutoModalProps = {
    title: string;
    style: CSSProperties;
    closable: boolean;
    centered?: boolean;
    keyboard: boolean;
    maskClosable: boolean;
    okText: string;
    successTitle?: string,
    onCancel?: (e: React.MouseEvent) => void;
    onOk?: (e: React.MouseEvent) => void;
    afterClose?: () => void;
}

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
}): AutoModal<TShowArg> {

    let userState: TModalState | undefined = undefined;
    const state = observable<{
        modalProps: AutoModalProps | null;
        visible: boolean;
        loading: boolean;
        result: null | { error?: any, returnValue?: JSX.Element; }
    }>({
        modalProps: null,
        visible: false,
        loading: false,
        result: null,
    }, undefined, {defaultDecorator: observable.ref});

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
                    state.result = {error: e};
                } finally {
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

    const renderError = (err: any): ReactElement => {
        let content;
        let title = 'Error';
        const codeBoxStyle = {fontSize: '12px', fontFamily: 'monospace', color: 'hsl(0deg 0% 25%)', margin: '0em 1em'};

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
        } else {
            // Object
            content = <div style={codeBoxStyle}>
                {toJson(err, 4)}
            </div>;
        }

        return <Result title={title} extra={content} status="error"/>
    };

    const renderSuccess = (response: JSX.Element | null | undefined) =>
        <Result status="success"
                title={options.modalProps.successTitle ?? 'Success'}
                extra={
                    <VStack>
                        <Box>
                            {response}
                        </Box>
                        <Button
                            variant="solid"
                            colorScheme="brand"
                            size="lg"
                            style={{width: '16rem'}}
                            onClick={() => {
                                state.modalProps?.afterClose?.()
                            }}
                        >Close</Button>
                    </VStack>
                }
        />

    // The component the user uses to render/mount into the jsx tree
    const Component = observer(() => {
        if (!state.modalProps) return <></>;

        let content: ReactElement;

        let modalState: 'error' | 'success' | 'normal' = 'normal'

        if (state.result) {
            if (state.result.error) {
                // Error
                modalState = 'error'
                content = renderError(state.result.error);
            } else {
                // Success
                modalState = 'success'
                content = renderSuccess(state.result.returnValue);
            }
        } else {
            // Normal
            modalState = 'normal'
            content = options.content(userState!);
        }

        return (
            <Modal
                isOpen={state.visible}
                onClose={() => {
                    state.modalProps?.afterClose?.()
                }}>
                <ModalOverlay/>
                <ModalContent style={state.modalProps.style}>
                    {modalState !== 'success' && <ModalHeader>{state.modalProps.title}</ModalHeader>}
                    <ModalBody>
                        {content}
                    </ModalBody>
                    {modalState !== 'success' && <ModalFooter>
                        <Flex gap={2}>
                            {modalState === 'normal' && <Button
                                variant="ghost"
                                onClick={(e) => {
                                    state.modalProps?.onCancel?.(e)
                                }}
                            >
                                Cancel
                            </Button>}
                            <Button
                                variant="solid"
                                isLoading={state.loading}
                                isDisabled={!options.isOkEnabled?.(userState!)}
                                onClick={(e) => {
                                    state.modalProps?.onOk?.(e)
                                }}
                            >
                                {modalState === 'error' ? 'Back' : state.modalProps.okText}
                            </Button>
                        </Flex>
                    </ModalFooter>}
                </ModalContent>
            </Modal>
        );
    });

    return {show, Component};
}

