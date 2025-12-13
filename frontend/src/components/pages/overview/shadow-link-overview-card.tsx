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

import { fromDataplaneShadowLink } from 'components/pages/shadowlinks/mappers/dataplane';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import type { ListShadowLinksResponse_ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import React, { type FC, useMemo } from 'react';
import { useGetShadowLinkQuery, useListShadowLinksQuery } from 'react-query/api/shadowlink';
import { useNavigate } from 'react-router-dom';

import { Feature, isSupported } from '../../../state/supported-features';
import { ShadowLinkDiagram } from '../shadowlinks/details/shadow-link-diagram';
import { ShadowLinkMetrics } from '../shadowlinks/details/shadow-link-metrics';

interface ShadowLinkOverviewCardProps {
  shadowLink: ListShadowLinksResponse_ShadowLink;
}

export const ShadowLinkOverviewCard: React.FC<ShadowLinkOverviewCardProps> = ({ shadowLink }) => {
  const navigate = useNavigate();

  // Fetch full shadow link data for metrics component
  const { data: fullShadowLinkData } = useGetShadowLinkQuery({ name: shadowLink.name });

  // Convert to unified model for child components
  const unifiedShadowLink = useMemo(
    () => (fullShadowLinkData?.shadowLink ? fromDataplaneShadowLink(fullShadowLinkData.shadowLink) : undefined),
    [fullShadowLinkData?.shadowLink]
  );

  return (
    <Card size="full" testId="shadow-link-overview-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Shadow Cluster</CardTitle>
        <CardAction>
          <Button
            onClick={() => navigate(`/shadowlinks/${shadowLink.name}`)}
            size="sm"
            testId="go-to-shadow-link-button"
            variant="outline"
          >
            Go to Shadow link
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Metrics */}
          {unifiedShadowLink && <ShadowLinkMetrics shadowLink={unifiedShadowLink} />}
          {/* Diagram */}
          {unifiedShadowLink && <ShadowLinkDiagram shadowLink={unifiedShadowLink} />}
        </div>
      </CardContent>
    </Card>
  );
};

// Functional component to fetch and display shadow link data
export const ShadowLinkSection: FC = () => {
  const {
    data: shadowLinksData,
    isLoading,
    error,
  } = useListShadowLinksQuery({}, { enabled: isSupported(Feature.ShadowLinkService) });

  // Don't render if error, loading, or no shadow link exists
  const shadowLinks = shadowLinksData?.shadowLinks || [];
  if (error || isLoading || shadowLinks.length === 0) {
    return null;
  }

  const shadowLink = shadowLinks[0]; // Only one shadow link is allowed

  return <ShadowLinkOverviewCard shadowLink={shadowLink} />;
};
