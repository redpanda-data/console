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
import { useNavigate, useParams } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useDeleteShadowLinkUnified,
  useFailoverShadowLinkMutation,
  useGetShadowLinkUnified,
} from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { ShadowLinkConfiguration } from './config/shadow-link-configuration';
import { DeleteShadowLinkDialog } from './delete-shadowlink-dialog';
import { FailoverDialog } from './failover-dialog';
import { ShadowLinkDetails } from './shadow-link-details';
import { TasksTable } from './tasks-table';
import { formatToastErrorMessageGRPC } from '../../../../utils/toast.utils';
import { ShadowLinkLoadErrorState, ShadowLinkNotFoundState } from '../list/shadowlink-empty-state';

type UnifiedShadowLinkQuery = ReturnType<typeof useGetShadowLinkUnified>;

const useShadowLinkBreadcrumbs = (name: string) => {
  useEffect(() => {
    uiState.pageTitle = name;
    uiState.pageBreadcrumbs = [
      { title: 'Shadow Links', linkTo: '/shadowlinks' },
      { title: name, linkTo: '' },
    ];
  }, [name]);
};

// Use unified delete hook (works in both embedded and non-embedded modes)
const useShadowLinkDelete = (name: string) => {
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { deleteShadowLink, isPending: isDeleting } = useDeleteShadowLinkUnified({ name });

  const handleDelete = () => {
    deleteShadowLink({
      force: false,
      onSuccess: () => {
        toast.success(`Shadowlink ${name} deleted`);
        navigate({ to: '/shadowlinks' }).catch((error: unknown) => {
          toast.error('Failed to navigate', { description: String(error) });
        });
      },
      onError: (error) => {
        toast.error(
          formatToastErrorMessageGRPC({
            error,
            action: 'delete',
            entity: 'shadowlink',
          })
        );
      },
    });
  };

  return { showDeleteDialog, setShowDeleteDialog, isDeleting, handleDelete };
};

/** Failover for the whole link, or for one topic when the dialog is opened with its name. */
const useShadowLinkFailover = (name: string, refetch: UnifiedShadowLinkQuery['refetch']) => {
  const [showFailoverDialog, setShowFailoverDialog] = useState(false);
  const [failoverTopicName, setFailoverTopicName] = useState<string>('');

  const { mutate: failoverShadowLink, isPending: isFailingOver } = useFailoverShadowLinkMutation({
    onSuccess: async () => {
      toast.success(failoverTopicName ? `Topic ${failoverTopicName} failed over` : 'Shadow link failed over');
      setShowFailoverDialog(false);
      setFailoverTopicName('');
      await refetch();
    },
    onError: (error) => {
      toast.error(`Failed to failover: ${error.message}`);
      setShowFailoverDialog(false);
      setFailoverTopicName('');
    },
  });

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

  const handleFailoverOpenChange = (open: boolean) => {
    setShowFailoverDialog(open);
    if (!open) {
      setFailoverTopicName('');
    }
  };

  return {
    failoverTopicName,
    showFailoverDialog,
    isFailingOver,
    handleFailover,
    openFailoverDialog,
    handleFailoverOpenChange,
  };
};

type ShadowLinkDetailsFallbackProps = {
  name: string;
  isLoading: boolean;
  error: UnifiedShadowLinkQuery['error'];
};

// Loading, load-error, and not-found states
const ShadowLinkDetailsFallback = ({ name, isLoading, error }: ShadowLinkDetailsFallbackProps) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2">
          <Spinner className="size-6" />
          <div className="text-body">Loading shadow link details...</div>
        </div>
      </div>
    );
  }

  if (error && error.code !== Code.NotFound) {
    return <ShadowLinkLoadErrorState errorMessage={error.message} />;
  }

  return <ShadowLinkNotFoundState name={name} onBackClick={() => navigate({ to: '/shadowlinks' })} />;
};

type ShadowLinkDetailsViewProps = {
  name: string;
  shadowLink: NonNullable<UnifiedShadowLinkQuery['data']>;
  hasPartialData: boolean;
  refetch: UnifiedShadowLinkQuery['refetch'];
};

const ShadowLinkDetailsView = ({ name, shadowLink, hasPartialData, refetch }: ShadowLinkDetailsViewProps) => {
  const navigate = useNavigate();
  const { showDeleteDialog, setShowDeleteDialog, isDeleting, handleDelete } = useShadowLinkDelete(name);
  const failover = useShadowLinkFailover(name, refetch);

  return (
    <div className="flex flex-col gap-6">
      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button onClick={() => failover.openFailoverDialog()} size="sm" variant="outline">
          Failover all topics
        </Button>

        <Button onClick={() => navigate({ to: `/shadowlinks/${name}/edit` })} size="sm" variant="outline">
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </Button>

        <Button disabled={isDeleting} onClick={() => setShowDeleteDialog(true)} size="sm" variant="destructive">
          {isDeleting ? (
            <>
              <Spinner className="mr-2" />
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
      {Boolean(hasPartialData) && (
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
        <TabsList testId="shadowlink-details-tabs">
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
              onFailoverTopic={failover.openFailoverDialog}
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
        isLoading={failover.isFailingOver}
        onConfirm={failover.handleFailover}
        onOpenChange={failover.handleFailoverOpenChange}
        open={failover.showFailoverDialog}
        topicName={failover.failoverTopicName}
      />
    </div>
  );
};

export const ShadowLinkDetailsPage = () => {
  const { name } = useParams({ from: '/shadowlinks/$name/' });
  useShadowLinkBreadcrumbs(name);

  // Fetch shadow link data using unified hook (works in both embedded and non-embedded modes)
  const {
    data: shadowLink,
    isLoading,
    error: errorGetShadowLink,
    dataplaneError,
    refetch,
  } = useGetShadowLinkUnified({ name: name ?? '' });

  if (isLoading || errorGetShadowLink || !shadowLink) {
    return <ShadowLinkDetailsFallback error={errorGetShadowLink} isLoading={isLoading} name={name ?? ''} />;
  }

  return (
    <ShadowLinkDetailsView
      // When dataplane fails but we have controlplane data (fallback scenario)
      hasPartialData={Boolean(dataplaneError)}
      name={name}
      refetch={refetch}
      shadowLink={shadowLink}
    />
  );
};
