import PageContent from 'components/misc/PageContent';
import { useNavigate } from 'react-router-dom';
import { ConnectTiles } from './connect-tiles';
import { useSessionStorage } from './hooks';
import type { ConnectComponentType, ConnectTilesFormData } from './types';
import { CONNECT_TILE_STORAGE_KEY } from './utils';

export const OnboardingWizard = () => {
  const [_, setPersistedConnectionName] = useSessionStorage<Partial<ConnectTilesFormData>>(
    CONNECT_TILE_STORAGE_KEY,
    {},
  );
  const navigate = useNavigate();

  const onSubmit = (connectionName: string, connectionType: ConnectComponentType) => {
    setPersistedConnectionName({ connectionName, connectionType });
    navigate('/rp-connect/create');
  };
  return (
    <PageContent>
      <ConnectTiles componentTypeFilter={['input', 'output']} onChange={onSubmit} variant="ghost" className="px-0" />
    </PageContent>
  );
};
