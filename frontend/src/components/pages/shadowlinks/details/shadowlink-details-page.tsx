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
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import type { LinkIdentity } from 'components/shadow-box/shadow-box-model';
import { AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isGuidedFailoverEnabled } from 'react-query/api/shadow-box';
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
import type { FailoverReadiness } from './failover-model';
import { FailoverTab } from './failover-tab';
import { ShadowLinkDetails } from './shadow-link-details';
import { TasksTable } from './tasks-table';
import { useFailoverReadiness } from './use-failover-readiness';
import { formatToastErrorMessageGRPC } from '../../../../utils/toast.utils';
import { ShadowLinkLoadErrorState, ShadowLinkNotFoundState } from '../list/shadowlink-empty-state';
import type { UnifiedShadowLink } from '../model';

type DetailsTab = 'overview' | 'tasks' | 'configuration' | 'failover';

/** Lag is the thing to watch on the Failover tab, so it polls quickly there. */
const FAILOVER_POLL_MS = 3000;
const BACKGROUND_POLL_MS = 60_000;

type ShadowLinkDetailsTabsProps = {
  name: string;
  tab: DetailsTab;
  onTabChange: (tab: DetailsTab) => void;
  shadowLink: UnifiedShadowLink;
  hasPartialData: boolean;
  /** Set only while the Failover tab shows; otherwise the tabs are as they were before it. */
  readiness: FailoverReadiness | undefined;
  linkIdentity: LinkIdentity;
  onRefresh: () => void;
  onFailoverTopic: (topicName?: string) => void;
  onRetryTopics: () => void;
};

const ShadowLinkDetailsTabs = ({
  name,
  tab,
  onTabChange,
  shadowLink,
  hasPartialData,
  readiness,
  linkIdentity,
  onRefresh,
  onFailoverTopic,
  onRetryTopics,
}: ShadowLinkDetailsTabsProps) => (
  <Tabs onValueChange={(value) => onTabChange(value as DetailsTab)} value={tab}>
    <TabsList className="mb-4" testId="shadowlink-details-tabs" variant="underline">
      <TabsTrigger testId="overview-tab" value="overview" variant="underline">
        Overview
      </TabsTrigger>
      <TabsTrigger testId="tasks-tab" value="tasks" variant="underline">
        Tasks
      </TabsTrigger>
      <TabsTrigger testId="configuration-tab" value="configuration" variant="underline">
        Configuration
      </TabsTrigger>
      {readiness ? (
        <TabsTrigger testId="failover-tab-trigger" value="failover" variant="underline">
          Failover
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

      {readiness ? (
        <TabsContent testId="failover-content" value="failover">
          <FailoverTab
            linkIdentity={linkIdentity}
            onRetryTopics={onRetryTopics}
            readiness={readiness}
            shadowLink={shadowLink}
          />
        </TabsContent>
      ) : null}
    </TabsContents>
  </Tabs>
);

/**
 * The open tab: a link that names one opens it, and the user's pick stays put while the Failover tab
 * comes and goes, instead of the tabs resetting to Overview. `pick` writes the tab to the URL only
 * with Failover, which other clusters' pages link to directly.
 */
const useDetailsTab = (name: string, requested: DetailsTab | undefined) => {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<DetailsTab>(requested ?? 'overview');
  const [lastRequested, setLastRequested] = useState(requested);
  if (requested !== lastRequested) {
    setLastRequested(requested);
    if (requested) {
      setPicked(requested);
    }
  }
  const pick = (next: DetailsTab, inUrl: boolean) => {
    setPicked(next);
    if (inUrl) {
      navigate({ to: '/shadowlinks/$name', params: { name }, search: { tab: next }, replace: true }).catch(
        (error: unknown) => {
          toast.error('Failed to navigate', { description: String(error) });
        }
      );
    }
  };
  return { picked, pick };
};

/**
 * The Failover tab shows once Cloud has read the source's fence in this visit. While the host is
 * still finding out, it shows only if the URL asks for it, so a link to it doesn't fall back to
 * Overview early.
 */
const guidedReadiness = (
  { readiness, available }: ReturnType<typeof useFailoverReadiness>,
  requested: DetailsTab | undefined
) => (readiness && (available || requested === 'failover') ? readiness : undefined);

/** A link to the Failover tab falls back to Overview while there's no Failover tab. */
const resolveDetailsTab = (requested: DetailsTab | undefined, guided: boolean): DetailsTab => {
  if (requested === 'failover' && !guided) {
    return 'overview';
  }
  return requested ?? 'overview';
};

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
const useShadowLinkFailover = (
  name: string,
  refetch: UnifiedShadowLinkQuery['refetch'],
  { guided, refetchTopics }: { guided: boolean; refetchTopics: () => Promise<unknown> }
) => {
  const [showFailoverDialog, setShowFailoverDialog] = useState(false);
  const [failoverTopicName, setFailoverTopicName] = useState<string>('');

  const { mutate: failoverShadowLink, isPending: isFailingOver } = useFailoverShadowLinkMutation({
    refreshTopics: guided,
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

  /** The dialog vouches for lag only from a read taken as it opens: the last poll can be a minute old. */
  const [checkingLag, setCheckingLag] = useState(false);
  const stopCheckingLag = () => setCheckingLag(false);
  const openFailoverDialog = (topicName?: string) => {
    setFailoverTopicName(topicName || '');
    setShowFailoverDialog(true);
    if (guided) {
      setCheckingLag(true);
      // A failed read ends the check too: the dialog then reports the lag as unreadable or out of date.
      refetchTopics().then(stopCheckingLag, stopCheckingLag);
    }
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
    checkingLag,
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
  const search = useSearch({ from: '/shadowlinks/$name/' });
  const detailsTab = useDetailsTab(name, search.tab);
  const failoverReadiness = useFailoverReadiness(shadowLink, {
    pollMs: detailsTab.picked === 'failover' ? FAILOVER_POLL_MS : BACKGROUND_POLL_MS,
    enabled: isGuidedFailoverEnabled(),
  });
  const { linkIdentity, refetchTopics } = failoverReadiness;
  const guided = guidedReadiness(failoverReadiness, detailsTab.picked);
  const tab = resolveDetailsTab(detailsTab.picked, guided !== undefined);
  const { showDeleteDialog, setShowDeleteDialog, isDeleting, handleDelete } = useShadowLinkDelete(name);
  const failover = useShadowLinkFailover(name, refetch, { guided: guided !== undefined, refetchTopics });

  return (
    <div className="flex flex-col gap-6">
      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button onClick={() => failover.openFailoverDialog()} size="sm" variant="outline">
          {guided ? 'Fail over all topics' : 'Failover all topics'}
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
      <ShadowLinkDetailsTabs
        hasPartialData={hasPartialData}
        linkIdentity={linkIdentity}
        name={name}
        onFailoverTopic={failover.openFailoverDialog}
        onRefresh={refetch}
        onRetryTopics={() => refetchTopics()}
        onTabChange={(next) => detailsTab.pick(next, guided !== undefined)}
        readiness={guided}
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
        checkingLag={failover.checkingLag}
        isLoading={failover.isFailingOver}
        onConfirm={failover.handleFailover}
        onOpenChange={failover.handleFailoverOpenChange}
        open={failover.showFailoverDialog}
        readiness={guided}
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
