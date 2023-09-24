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

import React from 'react';
import { Component } from 'react';
import { action, observable } from 'mobx';
import { XCircleIcon } from '@heroicons/react/solid';
import { Box, Text, Button, Flex, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay } from '@redpanda-data/ui';


class ErrorModal extends Component<ErrorModalProps> {
    title: string;
    subTitle: React.ReactNode;
    content: React.ReactNode;

    constructor(p: any) {
        super(p);
        this.title = this.props.title();
        this.subTitle = this.props.subTitle();
        this.content = this.props.content();
    }

    render() {
        const p = this.props;

        return <Modal
            isOpen={p.isVisible}
            onClose={p.onClose}
            onCloseComplete={p.afterClose}
        >
            <ModalOverlay />
            <ModalContent minW="3xl">
                <ModalHeader>
                    {this.title}
                </ModalHeader>
                <ModalBody>
                    <Flex flexDirection="column" gap={8}>
                        {/* Header */}
                        <Flex flexDirection="row" gap={2} pr={6}>

                            {/* Icon */}
                            <div style={{
                                height: '70px', // height determines icon size
                                alignSelf: 'center',
                            }}>
                                <XCircleIcon color="#F53649"/>
                            </div>

                            {/* Title */}
                            <Box alignSelf="center">
                                <Text>{this.subTitle}</Text>
                            </Box>
                        </Flex>

                        {/* Content */}
                        {this.content &&
                            <Box alignSelf="stretch" overflowY="auto" maxHeight="300px">
                                {this.content}
                            </Box>
                        }
                    </Flex>
                </ModalBody>
                <ModalFooter>
                    <Button onClick={p.onClose}>OK</Button>
                </ModalFooter>
            </ModalContent>

        </Modal>
    }
}

interface ErrorModalProps {
    key: number;

    title: () => string,
    subTitle: () => React.ReactNode,
    content: () => React.ReactNode,

    isVisible: boolean,
    onClose: () => void,
    afterClose: () => void,

    animate: boolean,
}

const errorModals: ErrorModalProps[] = observable([]);

let nextErrorKey = 0;
export function showErrorModal(title: string, subTitle: React.ReactNode, content: React.ReactNode) {
    const key = nextErrorKey++;

    // keep formatting for strings
    if (typeof content == 'string') {
        content = <div style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.6,
            fontFamily: 'monospace',
            fontSize: 'small',

        }}>{content}</div>
    }

    errorModals.push({
        key,

        title: () => title,
        subTitle: () => subTitle,
        content: () => content,

        isVisible: true,
        onClose: () => onClose(key),
        afterClose: () => afterClose(key),

        animate: true,
    });
}

const onClose = action((key: number) => {
    const current = errorModals[0];
    const next = errorModals.length > 1 ? errorModals[1] : undefined;

    if (next) {
        // Switch to next
        // don't animate current or next modal

        current.animate = false;
        next.animate = false;
        afterClose(key); // immediately switch to next
    }
    else {
        // last modal
        current.animate = true;
        current.isVisible = false;
    }
});

const afterClose = action((key: number) => {
    errorModals.removeAll(x => x.key == key);
});


export function renderErrorModals() {
    if (errorModals.length == 0) return null;
    const e = errorModals[0];
    return <ErrorModal {...e} />;
}


// showErrorModal(
//     'Consumer group not found',
//     <span>Could not find a consumer group named <span className='codeBox'>{"a9i6f8o4btroaw87"}</span> to compute new offsets.</span>,
//     null
// );
