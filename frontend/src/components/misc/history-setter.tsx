import { observer } from 'mobx-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { trackHubspotPage } from '../../hubspot/hubspot.helper';
import { appGlobal } from '../../state/app-global';
import { api } from '../../state/backend-api';

const HistorySetter = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Track page navigation in HubSpot and clear errors on route change
  useEffect(() => {
    // Clear errors when navigating to a new route
    api.errors = [];

    if (location.pathname) {
      trackHubspotPage(location.pathname);
    }
  }, [location.pathname]);

  appGlobal.navigate = navigate;
  appGlobal.location = location;
  return null;
};

export default observer(HistorySetter);
