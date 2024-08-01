import React, { useEffect, useState } from 'react';

import EnvContext, { UserInfo, SystemInfo } from './EnvContext';

interface ProviderParams {
  children: any
}

export default function Provider({children}: ProviderParams) {
  const [userIsLoading, setUserIsLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [refreshUserAt, setRefreshUserAt] = useState(0);

  const [systemIsLoading, setSystemIsLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [refreshSystemAt, setRefreshSystemAt] = useState(0);

  const refreshUserInfo = () => setRefreshUserAt(Date.now());
  const refreshSystemInfo = () => setRefreshSystemAt(Date.now());

  const developmentMode = process.env.NODE_ENV === 'development';
  let serverURL = '';
  if (developmentMode) {
    serverURL = `http://${window.location.hostname}:3001`;
    console.log(`Env var NODE_ENV is ${process.env.NODE_ENV}, so switching to dev server at ${serverURL}.`);
  }

  useEffect(() => {
    let subscribed = true;

    fetch(`${serverURL}/api/v1/user_info`, {credentials: 'same-origin'})
      .then((response) => response.json())
      .then((json: UserInfo) => {
        if ( !subscribed ) {
          return;
        }
        if ((json.avatar_url || '').length === 0) {
          json.avatar_url = '/img/avatars/test1.png';
        }
        if ((json.name || '').length === 0) {
          json.name = '<unknown>';
        }
        setUserInfo(json);
      })
      .catch((error) => console.error(error))
      .finally(() => subscribed ? setUserIsLoading(false) : null);

    return () => { subscribed = false };
  }, [serverURL, refreshUserAt]);

  useEffect(() => {
    let subscribed = true;

    fetch(`${serverURL}/api/v1/bare/system_info`, {credentials: 'same-origin'})
      .then((response) => response.json())
      .then((json: SystemInfo) => {
        if ( !subscribed ) {
          return;
        }
        setSystemInfo(json);
      })
      .finally(() => subscribed ? setSystemIsLoading(false) : null);

    return () => { subscribed = false };
  }, [serverURL, refreshSystemAt]);

  return (
    <EnvContext.Provider value={{
      serverURL: serverURL,
      developmentMode: developmentMode,
      system: {
        isLoading: systemIsLoading,
        info: systemInfo,
        refresh: refreshSystemInfo,
      },
      user: {
        isLoading: userIsLoading,
        info: userInfo,
        refresh: refreshUserInfo,
      },
    }}>
      {children}
    </EnvContext.Provider>
  );
}
