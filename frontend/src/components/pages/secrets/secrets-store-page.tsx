import { runInAction } from 'mobx';
import { useEffect } from 'react';
import { uiState } from 'state/uiState';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Secrets Store';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'Secrets Store', linkTo: '/secrets', heading: 'Secrets Store' });
  });
};

export const SecretsStorePage = () => {
  // Only run once
  useEffect(() => {
    updatePageTitle();
  }, []);

  return <div>SecretsStorePage</div>;
};
