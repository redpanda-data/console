import React, { useCallback, useContext } from 'react';
// import Modal from 'react-modal';

import ErrorDisplay from '../error/ErrorDisplay';
import EnvContext from '../env/EnvContext';
import { Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay } from '@redpanda-data/ui';

// import modalStyles from './modalStyle';

interface ErrorParams {
  title: string;
  what: Error | null;
  isOpen: boolean;
  closeModal: () => void;
};

export default function ErrorModal({ title, what, isOpen, closeModal }: ErrorParams) {
  const ctx = useContext(EnvContext);
  const serverURL = ctx.serverURL;

  const submitAnnoying = useCallback(() => {
    fetch(`${serverURL}/api/v1/user_error_report`, {
      credentials: 'same-origin',
      method: 'POST',
      body: JSON.stringify({
        title: title,
        what: what?.message || '',
      }),
    }).then(async (response) => {
      if (response.ok) {
        return response.text();
      }
      const text = await response.text();
      throw new Error(`${response.statusText}: ${text}`);
    })
      .catch((error) => console.error(error))
      .finally(() => closeModal());

  }, [serverURL, closeModal, title, what]);

  return <Modal
    isOpen={isOpen}
    onClose={closeModal}
  // style={modalStyles}
  >
    <ModalOverlay />

    <ModalContent>

      <ModalHeader>
        {title ? title : 'An error occurred'}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        {what ?
          <ErrorDisplay title={title} err={what}>
            <div className="bstdioBtnRow">
              <button onClick={closeModal} className="bstdioBtn bstdioMedPadBtn">
                That's okay, I'll move on
              </button>
              <button onClick={submitAnnoying} className="bstdioBtn bstdioMedPadBtn bstdioWarnBtn">
                That's rather annoying, please investigate this
              </button>
            </div>
          </ErrorDisplay> : null}
      </ModalBody>

    </ModalContent>
  </Modal>
};
