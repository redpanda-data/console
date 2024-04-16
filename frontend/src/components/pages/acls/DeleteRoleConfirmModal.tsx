import { FC } from 'react';
import { Text, ConfirmItemDeleteModal } from '@redpanda-data/ui';


export const DeleteRoleConfirmModal: FC<{
    numberOfPrincipals: number;
    onConfirm: () => void;
    buttonEl: React.ReactElement
}> = ({numberOfPrincipals, onConfirm, buttonEl}) => {
    return (
        <ConfirmItemDeleteModal heading="Delete role"  itemType="role" trigger={buttonEl} primaryActionLabel="Delete" secondaryActionLabel="Cancel" onConfirm={onConfirm}>
            <Text>This role is assigned to {numberOfPrincipals} {numberOfPrincipals === 1 ? 'principal' : 'principals'}. Deleting it will remove it from these principals and take those permissions away. The ACLs will all be deleted.</Text>
            <Text>To restore the permissions, the role will need to be recreated and reassigned to these principals. To confirm, type 'delete' in the confirmation box below.</Text>
        </ConfirmItemDeleteModal>
    )
}
