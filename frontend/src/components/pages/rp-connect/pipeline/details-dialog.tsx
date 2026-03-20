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

import { isSystemTag } from 'components/constants';
import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Heading, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { InfoIcon, List } from 'lucide-react';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type React from 'react';
import { useMemo } from 'react';

import { cpuToTasks } from '../tasks';
import { extractAllTopics } from '../utils/yaml';

type DetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline?: Pipeline;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
};

const DetailRow = ({
  label,
  value,
  children,
  copyable = false,
}: {
  label: React.ReactNode;
  value?: string;
  children?: React.ReactNode;
  copyable?: boolean;
}) => (
  <div className="grid min-h-7 min-w-0 grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_30px] gap-1">
    {typeof label === 'string' ? (
      <Text className="text-muted-foreground" variant="label">
        {label}
      </Text>
    ) : (
      (label ?? null)
    )}
    {children ?? <Text className="truncate">{value ?? ''}</Text>}
    {copyable && value ? <CopyButton content={value} size="sm" variant="ghost" /> : null}
  </div>
);

export function DetailsDialog({ open, onOpenChange, pipeline, onDelete, isDeleting }: DetailsDialogProps) {
  const configYaml = pipeline?.configYaml;
  const secrets = useMemo(
    () => (configYaml ? getUniqueSecretNames(extractSecretReferences(configYaml)) : []),
    [configYaml]
  );

  const topics = useMemo(() => (configYaml ? extractAllTopics(configYaml) : []), [configYaml]);

  const shouldShowReferencesCard = useMemo(
    () => secrets.length > 0 || topics.length > 0 || Object.keys(pipeline?.tags ?? {}).length > 0,
    [secrets.length, topics.length, pipeline?.tags]
  );

  const visibleTags = useMemo(
    () => Object.entries(pipeline?.tags ?? {}).filter(([k]) => !isSystemTag(k)),
    [pipeline?.tags]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Pipeline details</DialogTitle>
        </DialogHeader>

        {pipeline ? (
          <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto">
            <Card size="full" variant="outlined">
              <CardHeader>
                <CardTitle>Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="mt-4">
                <div className="flex flex-col gap-4">
                  <DetailRow copyable label="ID" value={pipeline.id} />
                  <DetailRow label="Description" value={pipeline.description} />
                  <DetailRow
                    label={
                      <Tooltip>
                        <Text className="flex items-center gap-1" variant="label">
                          Compute units
                          <TooltipTrigger>
                            <InfoIcon className="-mt-0.5 size-3 cursor-pointer text-muted-foreground" />
                          </TooltipTrigger>
                        </Text>
                        <TooltipContent>One compute unit = 0.1 CPU and 400 MB memory</TooltipContent>
                      </Tooltip>
                    }
                    value={`${cpuToTasks(pipeline.resources?.cpuShares) ?? 0}`}
                  />
                  <DetailRow copyable label="URL" value={pipeline.url} />
                  {pipeline.serviceAccount ? (
                    <DetailRow copyable label="Service account" value={pipeline.serviceAccount.clientId} />
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {shouldShowReferencesCard ? (
              <Card size="full" variant="outlined">
                <CardHeader>
                  <CardTitle>References</CardTitle>
                </CardHeader>
                <CardContent className="mt-4">
                  <div className="flex flex-col gap-4">
                    <DetailRow label="Secrets">
                      {secrets.length > 0 ? (
                        <BadgeGroup
                          className="flex-wrap"
                          maxVisible={2}
                          renderOverflowContent={(overflow) => (
                            <List>
                              {secrets.slice(-overflow.length).map((s) => (
                                <ListItem key={s}>{s}</ListItem>
                              ))}
                            </List>
                          )}
                          variant="simple-outline"
                        >
                          {secrets.map((s) => (
                            <Badge key={s} variant="simple-outline">
                              {s}
                            </Badge>
                          ))}
                        </BadgeGroup>
                      ) : null}
                    </DetailRow>
                    <DetailRow label="Topics">
                      {topics.length > 0 ? (
                        <BadgeGroup
                          className="flex-wrap"
                          maxVisible={2}
                          renderOverflowContent={(overflow) => (
                            <List>
                              {topics.slice(-overflow.length).map((t) => (
                                <ListItem key={t}>{t}</ListItem>
                              ))}
                            </List>
                          )}
                          variant="simple-outline"
                        >
                          {topics.map((t) => (
                            <Badge key={t} variant="simple-outline">
                              {t}
                            </Badge>
                          ))}
                        </BadgeGroup>
                      ) : null}
                    </DetailRow>
                    <DetailRow label="Tags">
                      {visibleTags.length > 0 ? (
                        <BadgeGroup
                          className="flex-wrap"
                          maxVisible={2}
                          renderOverflowContent={(overflow) => (
                            <List>
                              {visibleTags.slice(-overflow.length).map(([key, value]) => (
                                <ListItem key={key}>
                                  {key}: {value}
                                </ListItem>
                              ))}
                            </List>
                          )}
                          variant="simple-outline"
                        >
                          {visibleTags.map(([key, value]) => (
                            <Badge key={key} variant="simple-outline">
                              {key}: {value}
                            </Badge>
                          ))}
                        </BadgeGroup>
                      ) : null}
                    </DetailRow>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {onDelete ? (
              <div>
                <Separator />
                <Card variant="ghost">
                  <CardHeader>
                    <Heading level={4}>Danger zone</Heading>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <Text>
                      Deleting this pipeline is permanent and cannot be undone. Any secrets or resources used by this
                      pipeline will need to be cleaned up manually.
                    </Text>
                    <div>
                      <DeleteResourceAlertDialog
                        buttonText="Delete pipeline"
                        buttonVariant="destructive-outline"
                        isDeleting={isDeleting}
                        onDelete={onDelete}
                        resourceId={pipeline.id}
                        resourceName={pipeline.displayName || 'this pipeline'}
                        resourceType="Pipeline"
                        triggerVariant="button"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
