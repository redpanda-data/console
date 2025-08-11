import { Box, Heading, Stack } from '@redpanda-data/ui';
import { runInAction } from 'mobx';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { QuotaForm } from './components/quota-form';
import { QuotaPrecedenceBanner } from './components/quota-precedence-banner';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Quotas';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure clean navigation
    uiState.pageBreadcrumbs.push({ title: 'Quotas', linkTo: '/quotas', heading: 'Quotas' });
    uiState.pageBreadcrumbs.push({ title: 'Create Quota', linkTo: '/quotas/create', heading: 'Create Quota' });
  });
};

export const QuotaCreatePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateId = searchParams.get('duplicate');

  useEffect(() => {
    updatePageTitle();
  }, []);

  // TODO: If duplicateId is provided, fetch the existing quota and use it as initial data
  const initialData = duplicateId
    ? {
        // Load data from existing quota for duplication
        // This would require a separate API call or context
      }
    : undefined;

  const handleSuccess = () => {
    navigate('/quotas');
  };

  const handleCancel = () => {
    navigate('/quotas');
  };

  return (
    <Box maxWidth="800px">
      <Stack spacing={6}>
        <Box>
          <Heading as="h1" size="lg" mb={2}>
            Create Quota
          </Heading>
          {duplicateId && (
            <text fontSize="md" color="gray.600">
              Duplicating quota settings from existing quota
            </text>
          )}
        </Box>

        <QuotaPrecedenceBanner />

        <QuotaForm initialData={initialData} onSuccess={handleSuccess} onCancel={handleCancel} isEdit={false} />
      </Stack>
    </Box>
  );
};
