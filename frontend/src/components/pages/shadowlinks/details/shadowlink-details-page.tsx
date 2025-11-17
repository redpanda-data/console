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
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Edit, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useDeleteShadowLinkMutation,
  useFailoverShadowLinkMutation,
  useGetShadowLinkQuery,
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

  // Fetch shadow links data
  const { data: shadowLinksData, isLoading, error: errorGetShadowLink, refetch } = useGetShadowLinkQuery({ name });

  // Find the specific shadow link by name
  const shadowLink = shadowLinksData?.shadowLink;

  const { mutate: deleteShadowLink, isPending: isDeleting } = useDeleteShadowLinkMutation({
    onSuccess: () => {
      toast.success(`Shadowlink ${name} deleted`);
      navigate('/shadowlinks');
    },
    onError: (error) => {
      toast.error(formatToastErrorMessageGRPC({ error, action: 'delete', entity: 'shadowlink' }));
    },
  });

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
    if (name) {
      deleteShadowLink({ name, force: false } as Parameters<typeof deleteShadowLink>[0]);
    }
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

  // Error state
  if (errorGetShadowLink) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <Text>Error loading shadow link: {errorGetShadowLink.message}</Text>
        </div>
      </div>
    );
  }

  // Not found state
  if (!shadowLink) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="h-12 w-12 text-gray-400" />
          <Text variant="large">Shadow link not found</Text>
          <Button onClick={() => navigate('/shadowlinks')} variant="secondary">
            Back to Shadow Links
          </Button>
        </div>
      </div>
    );
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
            <TasksTable onRefresh={refetch} tasks={shadowLink.tasksStatus} />
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
