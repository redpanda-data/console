import { observer } from 'mobx-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { appGlobal } from '../../state/appGlobal';

const HistorySetter = () => {
  const navigate = useNavigate();
  const location = useLocation();
  appGlobal.navigate = navigate;
  appGlobal.location = location;
  return null;
};

export default observer(HistorySetter);
