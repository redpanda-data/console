import { useSessionStorage } from 'hooks/use-session-storage';
import { CONNECT_WIZARD_CONNECTOR_KEY, CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from 'state/connect/state';

import type { AddTopicFormData, AddUserFormData, ConnectTilesListFormData } from '../types/wizard';

export const useResetWizardSessionStorage = () => {
  const [_, setPersistedConnectionName] = useSessionStorage<Partial<ConnectTilesListFormData>>(
    CONNECT_WIZARD_CONNECTOR_KEY,
    {}
  );
  const [, setPersistedTopic] = useSessionStorage<Partial<AddTopicFormData>>(CONNECT_WIZARD_TOPIC_KEY, {});
  const [, setPersistedUser] = useSessionStorage<Partial<AddUserFormData>>(CONNECT_WIZARD_USER_KEY, {});

  return () => {
    setPersistedConnectionName({});
    setPersistedTopic({});
    setPersistedUser({});
  };
};
