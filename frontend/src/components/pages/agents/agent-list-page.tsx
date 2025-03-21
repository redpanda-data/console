import { runInAction } from 'mobx';
import { useEffect } from 'react';
import { uiState } from 'state/uiState';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'Agents', linkTo: '/agents', heading: 'Agents' });
  });
};

export const AgentListPage = () => {
  useEffect(() => {
    updatePageTitle();
  }, []);

  return <div>AgentListPage</div>;
};
