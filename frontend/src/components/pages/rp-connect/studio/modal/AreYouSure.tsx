import React from 'react';

import styles from './AreYouSure.module.css';
import { Modal, ModalBody, ModalContent, ModalHeader } from '@redpanda-data/ui';

export type AreYouSureParams = {
  what: string;
  explanation?: string;
  children?: any;
  onYes: () => void;
};

export default function AreYouSure({ params, closeModal }: {
  params: AreYouSureParams | null;
  closeModal: () => void;
}) {
  return <Modal
    isOpen={params !== null}
    onClose={closeModal}
  >
    <ModalHeader>
      Are you sure?
    </ModalHeader>

    <ModalContent>
      <ModalBody>
        <div className={styles.sureText}><strong>Are you sure you want to {params?.what}?</strong></div>
        {params?.explanation ? <div className={styles.explanation}>{params.explanation}</div> : null}
        {params?.children ? params.children : null}
        <div className="bstdioBtnRow">
          <button className="bstdioBtn bstdioStretchBtn bstdioWarnBtn bstdioMedPadBtn bstdioLayerThreeActive" onClick={() => {
            params?.onYes();
            closeModal();
          }}>Yes, I understand the consequences</button>
          <button className="bstdioBtn bstdioStretchBtn bstdioMedPadBtn bstdioLayerThreeActive" onClick={closeModal}>Cancel</button>
        </div>
      </ModalBody>
    </ModalContent>
  </Modal>
};
