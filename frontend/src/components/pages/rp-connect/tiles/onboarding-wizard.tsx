import PageContent from 'components/misc/PageContent';
import { useSessionStorage } from 'hooks/use-session-storage';
import { useNavigate } from 'react-router-dom';
import { CONNECT_TILE_STORAGE_KEY } from 'state/connect/state';
import type { ConnectComponentType } from '../types/rpcn-schema';
import type { ConnectTilesFormData } from '../types/wizard';
import { ConnectTiles } from './connect-tiles';

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
