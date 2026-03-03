import { Box } from '@redpanda-data/ui';
import React, { useEffect, useState } from 'react';

let nextModalId = 1;
type Modal = { id: number; element: JSX.Element };
const modals: Modal[] = [];
let setModalsState: React.Dispatch<React.SetStateAction<Modal[]>> | null = null;

function removeModal(id: number) {
  const index = modals.findIndex((x) => x.id === id);
  if (index < 0) {
    return;
  }
  modals.splice(index, 1);
  setModalsState?.([...modals]);
}

export function openModal<P extends object>(
  component: React.FunctionComponent<P> | React.ComponentClass<P, Record<string, never>>,
  props: Omit<P, 'closeModal'>
) {
  const id = nextModalId;
  nextModalId += 1;
  const p: typeof props & { closeModal: () => void } = {
    ...props,
    closeModal: () => removeModal(id),
  };

  const element = React.createElement(component, p as P, []);
  modals.push({ element, id });
  setModalsState?.([...modals]);
}

export const ModalContainer = () => {
  const [modalList, setModalList] = useState<Modal[]>([]);

  useEffect(() => {
    setModalsState = setModalList;
    return () => {
      setModalsState = null;
    };
  }, []);

  return (
    <Box id="modalContainer">
      {modalList.map((e) => (
        <React.Fragment key={e.id}>{e.element}</React.Fragment>
      ))}
    </Box>
  );
};
