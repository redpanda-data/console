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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Edit, Loader2, Trash2 } from 'lucide-react';
import { runInAction } from 'mobx';
import type { ShadowTopicStatus } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useEffect, useMemo, useState } from 'react';
import {
  useDeleteShadowLinkMutation,
  useFailoverShadowLinkMutation,
  useListShadowLinksQuery,
} from 'react-query/api/shadowlink';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

// Update page title using uiState pattern
export const updatePageTitle = (shadowLinkName: string) => {
  runInAction(() => {
    uiState.pageTitle = shadowLinkName;
    uiState.pageBreadcrumbs = [
      { title: 'Shadow Links', linkTo: '/shadowlinks' },
      { title: shadowLinkName, linkTo: `/shadowlinks/${shadowLinkName}` },
    ];
  });
};

const StatusBadge = ({ state }: { state: ShadowTopicState }) => {
  const stateInfo = {
    [ShadowTopicState.UNSPECIFIED]: { text: 'Unknown', className: 'bg-gray-100 text-gray-800' },
    [ShadowTopicState.ACTIVE]: { text: 'Active', className: 'bg-green-100 text-green-800' },
    [ShadowTopicState.FAULTED]: { text: 'Faulted', className: 'bg-red-100 text-red-800' },
    [ShadowTopicState.PAUSED]: { text: 'Paused', className: 'bg-yellow-100 text-yellow-800' },
    [ShadowTopicState.FAILING_OVER]: { text: 'Failing Over', className: 'bg-yellow-100 text-yellow-800' },
    [ShadowTopicState.FAILED_OVER]: { text: 'Failed Over', className: 'bg-blue-100 text-blue-800' },
    [ShadowTopicState.PROMOTING]: { text: 'Promoting', className: 'bg-purple-100 text-purple-800' },
    [ShadowTopicState.PROMOTED]: { text: 'Promoted', className: 'bg-purple-100 text-purple-800' },
  }[state] || { text: 'Unknown', className: 'bg-gray-100 text-gray-800' };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${stateInfo.className}`}
    >
      {stateInfo.text}
    </span>
  );
};

export const ShadowLinkDetailsPage = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showFailoverDialog, setShowFailoverDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [failoverTopicName, setFailoverTopicName] = useState<string>('');

  // Fetch shadow links data
  const { data: shadowLinksData, isLoading, error } = useListShadowLinksQuery();

  // Find the specific shadow link by name
  const shadowLink = useMemo(() => {
    return shadowLinksData?.shadowLinks?.find((sl) => sl.name === name);
  }, [shadowLinksData, name]);

  // Update page title
  useEffect(() => {
    if (name) {
      updatePageTitle(name);
    }
  }, [name]);

  const isDeleteConfirmed = confirmationText.toLowerCase() === 'delete';

  const { mutate: deleteShadowLink, isPending: isDeleting } = useDeleteShadowLinkMutation({
    onSuccess: () => {
      toast.success(`Shadowlink ${name} deleted`);
      navigate('/shadowlinks');
    },
    onError: (error) => {
      toast.error(`Failed to delete shadowlink: ${error.message}`);
    },
  });

  const { mutate: failoverShadowLink, isPending: isFailingOver } = useFailoverShadowLinkMutation({
    onSuccess: () => {
      toast.success(
        failoverTopicName ? `Topic ${failoverTopicName} failed over successfully` : 'Shadowlink failed over successfully'
      );
      setShowFailoverDialog(false);
      setFailoverTopicName('');
    },
    onError: (error) => {
      toast.error(`Failed to failover: ${error.message}`);
      setShowFailoverDialog(false);
      setFailoverTopicName('');
    },
  });

  const handleDelete = () => {
    if (isDeleteConfirmed && name) {
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

  // Calculate lag for a topic
  const calculateTopicLag = (topic: ShadowTopicStatus) => {
    let totalLag = 0;
    for (const partition of topic.partitionInformation || []) {
      const lag = Number(partition.sourceHighWatermark - partition.highWatermark);
      if (!Number.isNaN(lag) && lag >= 0) {
        totalLag += lag;
      }
    }
    return totalLag;
  };

  // Check if any topics are active
  const hasActiveTopics =
    shadowLink?.status?.shadowTopicStatuses?.some((topic) => topic.state === ShadowTopicState.ACTIVE) ?? false;

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
  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <Text>Error loading shadow link: {error.message}</Text>
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
      <Card size="full">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Manage your shadow link configuration and data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={() => setShowEditDialog(true)} size="sm" variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {hasActiveTopics && (
              <Button onClick={() => openFailoverDialog()} size="sm" variant="outline">
                Failover All Topics
              </Button>
            )}
            {!hasActiveTopics && (
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
            )}
          </div>
        </CardContent>
      </Card>

      {/* Topics Section */}
      <Card size="full">
        <CardHeader>
          <CardTitle>Topics</CardTitle>
          <CardDescription>
            {shadowLink.status?.shadowTopicStatuses?.length || 0} topics being shadowed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shadowLink.status?.shadowTopicStatuses?.length === 0 ? (
            <Text className="text-muted-foreground">No topics configured</Text>
          ) : (
            <Accordion className="w-full" type="multiple">
              {shadowLink.status?.shadowTopicStatuses?.map((topic) => {
                const totalLag = calculateTopicLag(topic);
                return (
                  <AccordionItem key={topic.name} value={topic.name}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-4">
                        <div className="flex flex-col items-start gap-2">
                          <Text className="font-semibold">{topic.name}</Text>
                          <div className="flex items-center gap-4">
                            <StatusBadge state={topic.state} />
                            <Text className="text-muted-foreground text-sm">
                              Lag: {totalLag.toLocaleString()} messages
                            </Text>
                            <Text className="text-muted-foreground text-sm">
                              {topic.partitionInformation?.length || 0} partitions
                            </Text>
                          </div>
                        </div>
                        {topic.state === ShadowTopicState.ACTIVE && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              openFailoverDialog(topic.name);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            Failover Topic
                          </Button>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Partition</TableHead>
                            <TableHead>Source HW</TableHead>
                            <TableHead>Local HW</TableHead>
                            <TableHead>Lag</TableHead>
                            <TableHead>State</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topic.partitionInformation?.map((partition) => {
                            const lag = Number(partition.sourceHighWatermark - partition.highWatermark);
                            return (
                              <TableRow key={Number(partition.partitionId)}>
                                <TableCell>{String(partition.partitionId)}</TableCell>
                                <TableCell>{partition.sourceHighWatermark.toString()}</TableCell>
                                <TableCell>{partition.highWatermark.toString()}</TableCell>
                                <TableCell>{lag.toLocaleString()}</TableCell>
                                <TableCell>
                                  <StatusBadge state={topic.state} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Tasks Section */}
      <Card size="full">
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Shadow link task status and information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center">
            <Text className="text-muted-foreground">Coming soon</Text>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog (Placeholder) */}
      <AlertDialog onOpenChange={setShowEditDialog} open={showEditDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Shadow Link</AlertDialogTitle>
            <AlertDialogDescription>
              Shadow link editing functionality will be available in a future update.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowEditDialog(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Delete Shadowlink</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <Text>
                You are about to delete <InlineCode>{shadowLink.name}</InlineCode>
              </Text>
              <Text>
                This action will cause data loss. To confirm, type "delete" into the confirmation box below.
              </Text>
              <Input
                className="mt-4"
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder='Type "delete" to confirm'
                value={confirmationText}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmationText('');
                setShowDeleteDialog(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={!isDeleteConfirmed || isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Failover Dialog */}
      <AlertDialog onOpenChange={setShowFailoverDialog} open={showFailoverDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Failover {failoverTopicName ? `Topic "${failoverTopicName}"` : 'All Topics'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {failoverTopicName
                ? `Are you sure you want to failover the topic "${failoverTopicName}"? This will promote the shadow topic to become the primary topic.`
                : `Are you sure you want to failover all topics in "${shadowLink.name}"? This will promote all shadow topics to become primary topics.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setFailoverTopicName('');
                setShowFailoverDialog(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction disabled={isFailingOver} onClick={handleFailover}>
              {isFailingOver ? 'Failing over...' : 'Failover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
