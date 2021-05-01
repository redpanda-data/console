import React from 'react';
import { Component } from 'react';
import { Modal, Radio, Select } from 'antd';
import { observer } from 'mobx-react';
import { action, makeObservable, observable, transaction } from 'mobx';
import { TrashIcon as TrashIconOutline, PencilIcon as PencilIconOutline } from '@heroicons/react/outline';
import { PencilIcon, TrashIcon, XCircleIcon } from '@heroicons/react/solid';
import { toJson } from '../../utils/jsonUtils';


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
            visible={p.isVisible}

            onOk={p.onClose}
            afterClose={p.afterClose}

            cancelButtonProps={{ style: { display: 'none' } }}

            bodyStyle={{ paddingTop: '1.5em' }}
            width="auto"
            style={{
                minWidth: 'min(95%, 550px)',
                maxWidth: 'min(900px, 80%)',
                width: 'auto',
                maxHeight: '100%'
            }}
            centered={true}
            maskClosable={false}
            closeIcon={<></>}
            transitionName={p.animate ? undefined : ""}
            maskTransitionName={p.animate ? undefined : ""}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2em' }}>
                {/* Header */}
                <div style={{ display: 'flex', flexDirection: 'row', gap: '22px', paddingRight: '1.5em' }}>

                    {/* Icon */}
                    <div style={{
                        height: '70px', // height determines icon size
                        alignSelf: 'center',
                        margin: '-6px', // compensate for built in padding
                        marginTop: '0px',
                    }}>
                        <XCircleIcon color="#F53649" />
                    </div>

                    {/* Title */}
                    <div style={{ alignSelf: 'center' }}>
                        <div style={{
                            color: 'hsla(0deg, 0%, 0%, 85%)',
                            fontSize: '16px', fontWeight: 500, lineHeight: 2,
                            overflow: 'hidden',
                        }}>{this.title}</div>
                        <div>{this.subTitle}</div>
                    </div>
                </div>

                {/* Content */}
                {this.content &&
                    <div style={{ alignSelf: 'stretch', overflowY: 'auto', maxHeight: '300px' }}>
                        {this.content}
                    </div>
                }
            </div>
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


showErrorModal(
    'Consumer group not found',
    <span>Could not find a consumer group named <span className='codeBox'>{"a9i6f8o4btroaw87"}</span> to compute new offsets.</span>,
    null
);