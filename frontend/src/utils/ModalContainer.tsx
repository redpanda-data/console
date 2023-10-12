import { Box } from '@redpanda-data/ui';
import { observable } from 'mobx';
import { observer } from 'mobx-react';
import React from 'react';


let nextModalId = 1;
const modals = observable([]) as {
    id: number;
    element: JSX.Element;
}[];

function removeModal(id: number) {
    const index = modals.findIndex(x => x.id == id);
    if (index < 0) return;
    modals.splice(index, 1);
}

export function openModal<P extends object>(component: React.FunctionComponent<P> | React.ComponentClass<P, any>, props: Omit<P, 'closeModal'>) {
    const id = nextModalId++;
    const p: typeof props & { closeModal: () => void } = {
        ...props,
        closeModal: () => removeModal(id),
    };

    const element = React.createElement(component, p as any, []);
    modals.push({
        element: element,
        id: id,
    });
}


export const ModalContainer = observer(() => {
    return <Box id="modalContainer">
        {modals.map(e => <React.Fragment key={e.id}>{e.element}</React.Fragment>)}
    </Box>
});
