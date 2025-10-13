/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

'use client';

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Heading } from 'components/redpanda-ui/components/typography';
import { ArrowLeft } from 'lucide-react';
import { runInAction } from 'mobx';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uiState } from 'state/ui-state';

// Update page title using uiState pattern
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Create Shadow Link';
    uiState.pageBreadcrumbs = [
      { title: 'Shadow Links', linkTo: '/shadowlinks' },
      { title: 'Create', linkTo: '/shadowlinks/create' }
    ];
  });
};

export const ShadowLinkCreatePage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    updatePageTitle();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle testId="create-shadowlink-form-title">
            <Heading level={2}>Create Shadowlink</Heading>
          </CardTitle>
          <CardDescription>
            This is a placeholder page. The shadowlink creation form will be implemented here in a future update.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => navigate('/shadowlinks')}
            testId="back-to-list-button"
            variant="outline"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Shadowlinks
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
