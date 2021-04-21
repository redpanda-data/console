import React from 'react';
import { Component } from 'react';
import { Modal, Radio, Select } from 'antd';
import { observer } from 'mobx-react';
import { observable } from 'mobx';
import { TrashIcon as TrashIconOutline, PencilIcon as PencilIconOutline } from '@heroicons/react/outline';
import { PencilIcon, TrashIcon, XCircleIcon } from '@heroicons/react/solid';


interface ErrorModalProps {
    modalTitle: JSX.Element,
    errorTitle: JSX.Element,
    content: JSX.Element,

    onClose: () => void,
}


@observer
export class ErrorModal extends Component<ErrorModalProps> {

    render() {
        const p = this.props;

        return <Modal
            title={p.modalTitle}
            visible={true}
            closeIcon={<></>} maskClosable={false}
            cancelButtonProps={{ style: { visibility: 'collapse' } }}
            bodyStyle={{ paddingTop: '1em' }}
            width="650px"

            onOk={this.props.onClose}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: '80px', height: '80px' }}>
                    <XCircleIcon color="#F53649" />
                </span>
                <h2 style={{ color: 'rgba(0, 0, 0, 0.65)' }}>{p.errorTitle}</h2>
                <div style={{ alignSelf: 'stretch', margin: '0 1em', marginTop: '1em' }}>
                    {p.content}
                </div>
            </div>
        </Modal>
    }
}