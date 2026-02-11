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

import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Result,
  VStack,
} from '@redpanda-data/ui';
import React, { type CSSProperties, type ReactElement, type ReactNode, useState } from 'react';

import { toJson } from './json-utils';

export type AutoModalProps = {
  title: string;
  style: CSSProperties;
  closable: boolean;
  centered?: boolean;
  keyboard: boolean;
  maskClosable: boolean;
  okText: string;
  successTitle?: string;
  onCancel?: (e: React.MouseEvent) => void;
  onOk?: (e: React.MouseEvent) => void;
  afterClose?: () => void;
};

export type AutoModal<TArg> = {
  show: (arg: TArg) => void;
  Component: () => JSX.Element | null;
};

type ModalState<TModalState> = {
  modalProps: AutoModalProps | null;
  visible: boolean;
  loading: boolean;
  result: null | { error?: unknown; returnValue?: JSX.Element };
  userState: TModalState | null;
};

// Create a wrapper for <Modal/>  takes care of rendering depending on 'visible'
// - keeps rendering the modal until its close animation is actually finished
// - automatically renders content for states like 'Loading' (disable controls etc) or 'Error' (display error and allow trying again)
export default function createAutoModal<TShowArg, TModalState>(options: {
  modalProps: AutoModalProps;
  // called when the returned 'show()' method is called.
  // Return the state for your modal here
  onCreate: (arg: TShowArg) => TModalState;
  // return the component that will handle editting the modal-state (that you returned from 'onCreate')
  content: (state: TModalState) => React.ReactElement;
  // called when the user clicks the Ok button; do network requests in here
  // return some JSX (or null) to show the success page, or throw an error if anything went wrong to show the error page
  onOk: (state: TModalState) => Promise<JSX.Element | undefined>;
  // used to determine whether or not the 'ok' button is enabled
  isOkEnabled?: (state: TModalState) => boolean;
  // called when 'onOk' has returned (and not thrown an exception)
  onSuccess?: (state: TModalState, result: JSX.Element | undefined) => void;
}): AutoModal<TShowArg> {
  let updateState: ((updater: (prev: ModalState<TModalState>) => ModalState<TModalState>) => void) | undefined;

  // Called by user to create a new modal instance
  const show = (arg: TShowArg) => {
    if (!updateState) {
      return;
    }

    const baseUserState = options.onCreate(arg);

    // Create a Proxy that triggers state updates when properties are modified
    // This maintains backward compatibility with content components that mutate state directly
    const userState = new Proxy(baseUserState as object, {
      set(target: any, prop: string | symbol, value: any) {
        target[prop] = value;
        // Trigger a state update to re-render
        updateState?.((prev) => ({ ...prev }));
        return true;
      },
    }) as TModalState;

    const modalProps: AutoModalProps = {
      ...options.modalProps,
      onCancel: () => {
        updateState?.((prev) => ({ ...prev, visible: false, result: null }));
      },
      onOk: async () => {
        let currentUserState: TModalState | null = null;

        // Get current state
        updateState?.((prev) => {
          currentUserState = prev.userState;
          if (prev.result?.error) {
            // Error -> Clear - return early without executing onOk
            return { ...prev, result: null };
          }
          return prev;
        });

        // Check if we cleared an error (would have returned above if so)
        if (!currentUserState) {
          return;
        }

        try {
          updateState?.((prev) => ({ ...prev, loading: true }));

          // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
          const returnValue = (await options.onOk(currentUserState!)) ?? undefined;
          const result = { returnValue, error: undefined };

          updateState?.((prev) => ({ ...prev, loading: false, result }));

          // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
          options.onSuccess?.(currentUserState!, returnValue);
        } catch (e) {
          updateState?.((prev) => ({ ...prev, loading: false, result: { error: e } }));
        }
      },
      afterClose: () => {
        updateState?.(() => ({
          modalProps: null,
          visible: false,
          loading: false,
          result: null,
          userState: null,
        }));
      },
    };

    updateState((prev) => ({ ...prev, modalProps, visible: true, userState }));
  };

  // The component the user uses to render/mount into the jsx tree
  const Component = () => {
    const [state, setState] = useState<ModalState<TModalState>>({
      modalProps: null,
      visible: false,
      loading: false,
      result: null,
      userState: null,
    });

    // Set up the state updater callback
    updateState = setState;

    const renderError = (err: unknown): ReactElement => {
      let content: ReactNode;
      let title = 'Error';
      const codeBoxStyle = {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: 'hsl(0deg 0% 25%)',
        margin: '0em 1em',
      };

      if (React.isValidElement(err)) {
        // JSX
        content = err;
      } else if (typeof err === 'string') {
        // String
        content = <div style={codeBoxStyle}>{err}</div>;
      } else if (err instanceof Error) {
        // Error
        title = err.name;
        content = <div style={codeBoxStyle}>{err.message}</div>;
      } else {
        // Object
        content = <div style={codeBoxStyle}>{toJson(err, 4)}</div>;
      }

      return <Result extra={content} status="error" title={title} />;
    };

    const renderSuccess = (response: JSX.Element | null | undefined) => (
      <Result
        extra={
          <VStack>
            <Box>{response}</Box>
            <Button
              data-testid="create-topic-success__close-button"
              onClick={() => {
                state.modalProps?.afterClose?.();
              }}
              size="lg"
              style={{ width: '16rem' }}
              variant="solid"
            >
              Close
            </Button>
          </VStack>
        }
        status="success"
        title={options.modalProps.successTitle ?? 'Success'}
      />
    );

    if (!(state.modalProps && state.userState)) {
      return null;
    }

    let content: ReactElement;

    let modalState: 'error' | 'success' | 'normal' = 'normal';

    if (state.result) {
      if (state.result.error) {
        // Error
        modalState = 'error';
        content = renderError(state.result.error);
      } else {
        // Success
        modalState = 'success';
        content = renderSuccess(state.result.returnValue);
      }
    } else {
      // Normal
      modalState = 'normal';
      content = options.content(state.userState);
    }

    return (
      <Modal
        isOpen={state.visible}
        onClose={() => {
          state.modalProps?.afterClose?.();
        }}
      >
        <ModalOverlay />
        <ModalContent style={state.modalProps.style}>
          {modalState !== 'success' && <ModalHeader>{state.modalProps.title}</ModalHeader>}
          <ModalBody>{content}</ModalBody>
          {modalState !== 'success' && (
            <ModalFooter>
              <Flex gap={2}>
                {modalState === 'normal' && (
                  <Button
                    onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                      state.modalProps?.onCancel?.(e);
                    }}
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  data-testid="onOk-button"
                  isDisabled={!options.isOkEnabled?.(state.userState)}
                  isLoading={state.loading}
                  onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                    state.modalProps?.onOk?.(e);
                  }}
                  variant="solid"
                >
                  {modalState === 'error' ? 'Back' : state.modalProps.okText}
                </Button>
              </Flex>
            </ModalFooter>
          )}
        </ModalContent>
      </Modal>
    );
  };

  return { show, Component };
}
