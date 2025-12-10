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

import { Code } from '@connectrpc/connect';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertTriangle, Edit, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useDeleteShadowLinkUnified,
  useFailoverShadowLinkMutation,
  useGetShadowLinkUnified,
} from 'react-query/api/shadowlink';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { ShadowLinkConfiguration } from './config/shadow-link-configuration';
import { DeleteShadowLinkDialog } from './delete-shadowlink-dialog';
import { FailoverDialog } from './failover-dialog';
import { ShadowLinkDetails } from './shadow-link-details';
import { TasksTable } from './tasks-table';
import { formatToastErrorMessageGRPC } from '../../../../utils/toast.utils';
import { ShadowLinkLoadErrorState, ShadowLinkNotFoundState } from '../list/shadowlink-empty-state';

export const ShadowLinkDetailsPage = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showFailoverDialog, setShowFailoverDialog] = useState(false);
  const [failoverTopicName, setFailoverTopicName] = useState<string>('');

  useEffect(() => {
    if (name) {
      uiState.pageBreadcrumbs = [
        { title: 'Shadow Links', linkTo: '/shadowlinks' },
        { title: name, linkTo: '' },
      ];
    }
  }, [name]);

  // Fetch shadow link data using unified hook (works in both embedded and non-embedded modes)
  const {
    data: shadowLink,
    isLoading,
    error: errorGetShadowLink,
    dataplaneError,
    refetch,
  } = useGetShadowLinkUnified({ name: name ?? '' });

  // When dataplane fails but we have controlplane data (fallback scenario)
  const hasPartialData = Boolean(shadowLink && dataplaneError);

  // Use unified delete hook (works in both embedded and non-embedded modes)
  const { deleteShadowLink, isPending: isDeleting } = useDeleteShadowLinkUnified({ name: name ?? '' });

  const { mutate: failoverShadowLink, isPending: isFailingOver } = useFailoverShadowLinkMutation({
    onSuccess: () => {
      toast.success(
        failoverTopicName
          ? `Topic ${failoverTopicName} failed over successfully`
          : 'Shadowlink failed over successfully'
      );
      setShowFailoverDialog(false);
      setFailoverTopicName('');
      void refetch();
    },
    onError: (error) => {
      toast.error(`Failed to failover: ${error.message}`);
      setShowFailoverDialog(false);
      setFailoverTopicName('');
    },
  });

  const handleDelete = () => {
    deleteShadowLink({
      force: false,
      onSuccess: () => {
        toast.success(`Shadowlink ${name} deleted`);
        navigate('/shadowlinks');
      },
      onError: (error) => {
        toast.error(formatToastErrorMessageGRPC({ error, action: 'delete', entity: 'shadowlink' }));
      },
    });
  };

  const handleFailover = () => {
    if (name) {
      failoverShadowLink({
        name,
        shadowTopicName: failoverTopicName,
      } as Parameters<typeof failoverShadowLink>[0]);
    }
  };

  const openFailoverDialog = (topicName?: string) => {
    setFailoverTopicName(topicName || '');
    setShowFailoverDialog(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <Text>Loading shadow link details...</Text>
        </div>
      </div>
    );
  }

  // Not found error state
  if (errorGetShadowLink?.code === Code.NotFound) {
    return <ShadowLinkNotFoundState name={name ?? ''} onBackClick={() => navigate('/shadowlinks')} />;
  }

  // Other error state
  if (errorGetShadowLink) {
    return <ShadowLinkLoadErrorState errorMessage={errorGetShadowLink.message} />;
  }

  // Not found state
  if (!shadowLink) {
    return <ShadowLinkNotFoundState name={name ?? ''} onBackClick={() => navigate('/shadowlinks')} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button onClick={() => openFailoverDialog()} size="sm" variant="outline">
          Failover all topics
        </Button>

        <Button onClick={() => navigate(`/shadowlinks/${name}/edit`)} size="sm" variant="outline">
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </Button>

        <Button disabled={isDeleting} onClick={() => setShowDeleteDialog(true)} size="sm" variant="destructive">
          {isDeleting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </>
          )}
        </Button>
      </div>

      {/* Partial Data Warning Banner */}
      {hasPartialData && (
        <Alert testId="partial-data-warning" variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Limited data available</AlertTitle>
          <AlertDescription>
            Some shadow link details could not be loaded. Task status and topic properties may be unavailable.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList testId="shadowlink-details-tabs" variant="default">
          <TabsTrigger testId="overview-tab" value="overview" variant="underline">
            Overview
          </TabsTrigger>
          <TabsTrigger testId="tasks-tab" value="tasks" variant="underline">
            Tasks
          </TabsTrigger>
          <TabsTrigger testId="configuration-tab" value="configuration" variant="underline">
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContents>
          <TabsContent testId="overview-content" value="overview">
            <ShadowLinkDetails
              onFailoverTopic={openFailoverDialog}
              shadowLink={shadowLink}
              shadowLinkName={name || ''}
            />
          </TabsContent>

          <TabsContent testId="tasks-content" value="tasks">
            <TasksTable dataUnavailable={hasPartialData} onRefresh={refetch} tasks={shadowLink.tasksStatus} />
          </TabsContent>

          <TabsContent testId="configuration-content" value="configuration">
            <ShadowLinkConfiguration shadowLink={shadowLink} />
          </TabsContent>
        </TabsContents>
      </Tabs>

      {/* Delete Dialog */}
      <DeleteShadowLinkDialog
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onOpenChange={setShowDeleteDialog}
        open={showDeleteDialog}
        shadowLinkName={shadowLink.name}
      />

      {/* Failover Dialog */}
      <FailoverDialog
        isLoading={isFailingOver}
        onConfirm={handleFailover}
        onOpenChange={(open) => {
          setShowFailoverDialog(open);
          if (!open) {
            setFailoverTopicName('');
          }
        }}
        open={showFailoverDialog}
        topicName={failoverTopicName}
      />
    </div>
  );
};
