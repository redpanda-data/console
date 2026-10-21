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
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { AlertTriangle, Edit, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isCutoverAvailable } from 'react-query/api/shadow-box';
import {
  useDeleteShadowLinkUnified,
  useFailoverShadowLinkMutation,
  useGetShadowLinkUnified,
} from 'react-query/api/shadowlink';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { ShadowLinkConfiguration } from './config/shadow-link-configuration';
import type { CutoverReadiness } from './cutover-model';
import { CutoverTab } from './cutover-tab';
import { DeleteShadowLinkDialog } from './delete-shadowlink-dialog';
import { FailoverDialog } from './failover-dialog';
import { ShadowLinkDetails } from './shadow-link-details';
import { TasksTable } from './tasks-table';
import { useCutoverReadiness } from './use-cutover-readiness';
import { formatToastErrorMessageGRPC } from '../../../../utils/toast.utils';
import { ShadowLinkLoadErrorState, ShadowLinkNotFoundState } from '../list/shadowlink-empty-state';
import type { UnifiedShadowLink } from '../model';

type DetailsTab = 'overview' | 'tasks' | 'configuration' | 'cutover';

/** Lag is the thing to watch on the Cutover tab, so it polls quickly there. */
const CUTOVER_POLL_MS = 3000;
const BACKGROUND_POLL_MS = 60_000;

type ShadowLinkDetailsTabsProps = {
  name: string;
  tab: DetailsTab;
  shadowLink: UnifiedShadowLink;
  cutoverAvailable: boolean;
  hasPartialData: boolean;
  readiness: CutoverReadiness;
  linkPrincipal: string | undefined;
  isFailingOverAll: boolean;
  onRefresh: () => void;
  onFailoverTopic: (topicName?: string) => void;
  onFailoverAll: () => void;
  onManualConfirmChange: (confirmed: boolean) => void;
  onRetryTopics: () => void;
};

const ShadowLinkDetailsTabs = ({
  name,
  tab,
  shadowLink,
  cutoverAvailable,
  hasPartialData,
  readiness,
  linkPrincipal,
  isFailingOverAll,
  onRefresh,
  onFailoverTopic,
  onFailoverAll,
  onManualConfirmChange,
  onRetryTopics,
}: ShadowLinkDetailsTabsProps) => {
  const navigate = useNavigate();
  // The tab lives in the URL only with Cutover, which other clusters' pages link to directly.
  const tabState = cutoverAvailable
    ? {
        value: tab,
        onValueChange: (value: string) =>
          navigate({
            to: '/shadowlinks/$name',
            params: { name },
            search: { tab: value as DetailsTab },
            replace: true,
          }),
      }
    : { defaultValue: 'overview' };
  return (
    <Tabs {...tabState}>
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
        {cutoverAvailable ? (
          <TabsTrigger testId="cutover-tab-trigger" value="cutover" variant="underline">
            Cutover
          </TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContents>
        <TabsContent testId="overview-content" value="overview">
          <ShadowLinkDetails onFailoverTopic={onFailoverTopic} shadowLink={shadowLink} shadowLinkName={name} />
        </TabsContent>

        <TabsContent testId="tasks-content" value="tasks">
          <TasksTable dataUnavailable={hasPartialData} onRefresh={onRefresh} tasks={shadowLink.tasksStatus} />
        </TabsContent>

        <TabsContent testId="configuration-content" value="configuration">
          <ShadowLinkConfiguration shadowLink={shadowLink} />
        </TabsContent>

        {cutoverAvailable ? (
          <TabsContent testId="cutover-content" value="cutover">
            <CutoverTab
              isFailingOver={isFailingOverAll}
              linkPrincipal={linkPrincipal}
              onFailoverAll={onFailoverAll}
              onManualConfirmChange={onManualConfirmChange}
              onRetryTopics={onRetryTopics}
              readiness={readiness}
              shadowLink={shadowLink}
            />
          </TabsContent>
        ) : null}
      </TabsContents>
    </Tabs>
  );
};

/** The Cutover tab only exists while shadow boxing is on; a link to it falls back to Overview. */
const resolveDetailsTab = (requested: DetailsTab | undefined, cutoverAvailable: boolean): DetailsTab => {
  if (requested === 'cutover' && !cutoverAvailable) {
    return 'overview';
  }
  return requested ?? 'overview';
};

export const ShadowLinkDetailsPage = () => {
  const { name } = useParams({ from: '/shadowlinks/$name/' });
  const search = useSearch({ from: '/shadowlinks/$name/' });
  const navigate = useNavigate();
  const cutoverAvailable = isCutoverAvailable();
  const tab = resolveDetailsTab(search.tab, cutoverAvailable);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showFailoverDialog, setShowFailoverDialog] = useState(false);
  const [failoverTopicName, setFailoverTopicName] = useState<string>('');

  useEffect(() => {
    uiState.pageTitle = name;
    uiState.pageBreadcrumbs = [
      { title: 'Shadow Links', linkTo: '/shadowlinks' },
      { title: name, linkTo: '' },
    ];
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

  const { readiness, linkPrincipal, setManuallyConfirmed, refetchTopics } = useCutoverReadiness(shadowLink, {
    pollMs: tab === 'cutover' ? CUTOVER_POLL_MS : BACKGROUND_POLL_MS,
    enabled: cutoverAvailable,
  });

  // Use unified delete hook (works in both embedded and non-embedded modes)
  const { deleteShadowLink, isPending: isDeleting } = useDeleteShadowLinkUnified({ name: name ?? '' });

  const { mutate: failoverShadowLink, isPending: isFailingOver } = useFailoverShadowLinkMutation({
    refreshTopics: cutoverAvailable,
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

  const handleDelete = () => {
    deleteShadowLink({
      force: false,
      onSuccess: () => {
        toast.success(`Shadowlink ${name} deleted`);
        navigate({ to: '/shadowlinks' });
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

  const handleFailover = () => {
    if (name) {
      failoverShadowLink({
        name,
        shadowTopicName: failoverTopicName,
      } as Parameters<typeof failoverShadowLink>[0]);
    }
  };

  /** The dialog vouches for lag only from a read taken as it opens: the last poll can be a minute old. */
  const [checkingLag, setCheckingLag] = useState(false);
  const openFailoverDialog = (topicName?: string) => {
    setFailoverTopicName(topicName || '');
    setShowFailoverDialog(true);
    if (cutoverAvailable) {
      setCheckingLag(true);
      Promise.resolve(refetchTopics()).finally(() => setCheckingLag(false));
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <div className="text-body">Loading shadow link details...</div>
        </div>
      </div>
    );
  }

  // Not found error state
  if (errorGetShadowLink?.code === Code.NotFound) {
    return <ShadowLinkNotFoundState name={name ?? ''} onBackClick={() => navigate({ to: '/shadowlinks' })} />;
  }

  // Other error state
  if (errorGetShadowLink) {
    return <ShadowLinkLoadErrorState errorMessage={errorGetShadowLink.message} />;
  }

  // Not found state
  if (!shadowLink) {
    return <ShadowLinkNotFoundState name={name ?? ''} onBackClick={() => navigate({ to: '/shadowlinks' })} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button onClick={() => openFailoverDialog()} size="sm" variant="outline">
          {cutoverAvailable ? 'Fail over all topics' : 'Failover all topics'}
        </Button>

        <Button onClick={() => navigate({ to: `/shadowlinks/${name}/edit` })} size="sm" variant="outline">
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
      <ShadowLinkDetailsTabs
        cutoverAvailable={cutoverAvailable}
        hasPartialData={hasPartialData}
        isFailingOverAll={isFailingOver && !failoverTopicName}
        linkPrincipal={linkPrincipal}
        name={name}
        onFailoverAll={() => openFailoverDialog()}
        onFailoverTopic={openFailoverDialog}
        onManualConfirmChange={setManuallyConfirmed}
        onRefresh={refetch}
        onRetryTopics={() => refetchTopics()}
        readiness={readiness}
        shadowLink={shadowLink}
        tab={tab}
      />

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
        checkingLag={checkingLag}
        isLoading={isFailingOver}
        onConfirm={handleFailover}
        onOpenChange={(open) => {
          setShowFailoverDialog(open);
          if (!open) {
            setFailoverTopicName('');
          }
        }}
        open={showFailoverDialog}
        readiness={cutoverAvailable ? readiness : undefined}
        topicName={failoverTopicName}
      />
    </div>
  );
};
