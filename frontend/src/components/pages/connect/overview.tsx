/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Badge } from 'components/redpanda-ui/components/badge';
import { Link } from 'components/redpanda-ui/components/typography';
import { WaitingRedpanda } from 'components/redpanda-ui/components/waiting-redpanda';
import type { FunctionComponent } from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import { toast } from 'sonner';
import { docsLinks } from 'utils/docs-links';

import { TabKafkaConnect } from './kafka-connect-tab';
import { isEmbedded, isServerless } from '../../../runtime-config';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { Features, useSupportedFeaturesStore } from '../../../state/supported-features';
import { arrayRemoveAll } from '../../../utils/array-utils';
import { PageContent } from '../../misc/page-content';
import { type Tab, Tabs } from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';
import { PipelineListPage } from '../rp-connect/pipeline/list';
import { RpConnectPipelinesList } from '../rp-connect/pipelines-list';
import { RedpandaConnectIntro } from '../rp-connect/redpanda-connect-intro';

const ConnectView = {
  KafkaConnect: 'kafka-connect',
  RedpandaConnect: 'redpanda-connect',
  RedpandaConnectSecret: 'redpanda-connect-secret',
} as const;

type ConnectView = (typeof ConnectView)[keyof typeof ConnectView];

/**
 * The Redpanda Connect Secret Manager introduces a new tab in Redpanda Connect.
 * this logic determines which tab should be opened based on the `defaultTab`
 * query parameter in the URL.
 */
const getDefaultView = (
  defaultView: string
): {
  initialTab: ConnectView;
  redpandaConnectTab: ConnectView;
} => {
  const showKafkaTab = { initialTab: ConnectView.KafkaConnect, redpandaConnectTab: ConnectView.RedpandaConnect };
  const showRedpandaConnectTab = {
    initialTab: ConnectView.RedpandaConnect,
    redpandaConnectTab: ConnectView.RedpandaConnect,
  };

  switch (defaultView) {
    case 'kafka-connect':
      return showKafkaTab;
    case 'redpanda-connect':
      return showRedpandaConnectTab;
    case 'redpanda-connect-secret':
      return { initialTab: ConnectView.RedpandaConnect, redpandaConnectTab: ConnectView.RedpandaConnectSecret };
    default:
      return showRedpandaConnectTab;
  }
};

const WrapKafkaConnectOverview: FunctionComponent<{
  matchedPath: string;
  defaultTab?: ConnectView;
}> = (props) => {
  const { data: kafkaConnectors, isLoading: isLoadingKafkaConnectors } = useKafkaConnectConnectorsQuery();

  const isKafkaConnectEnabled = kafkaConnectors?.isConfigured === true;

  return (
    <KafkaConnectOverview
      defaultView={props.defaultTab ?? ''}
      isKafkaConnectEnabled={isKafkaConnectEnabled}
      isLoadingKafkaConnectors={isLoadingKafkaConnectors}
      matchedPath={props.matchedPath}
    />
  );
};

const RpConnectTabContent = () => {
  const featurePipelinesApi = useSupportedFeaturesStore((s) => s.pipelinesApi);
  return featurePipelinesApi ? <RpConnectPipelinesList matchedPath="/rp-connect" /> : <RedpandaConnectIntro />;
};

class KafkaConnectOverview extends PageComponent<{
  defaultView: string;
  isKafkaConnectEnabled: boolean;
  isLoadingKafkaConnectors: boolean;
}> {
  initPage(p: PageInitHelper): void {
    p.title = 'Connect';
    p.addBreadcrumb('Connect', '/connect-clusters');

    this.refreshData();
    appGlobal.onRefresh = () => this.refreshData();
  }

  // HTTP errors land in api.connectConnectorsError; this reports requests that fail outright.
  refreshData() {
    api.refreshConnectClusters().catch((error: unknown) => {
      toast.error('Failed to load Kafka Connect clusters', { description: String(error) });
    });
  }

  render() {
    // Cloud gets the new list; self-hosted keeps the tabs below.
    if (isEmbedded()) {
      return <PipelineListPage />;
    }
    if (this.props.isLoadingKafkaConnectors) {
      return <WaitingRedpanda />;
    }
    const tabs = [
      {
        key: ConnectView.RedpandaConnect,
        title: (
          <div className="min-w-[180px]">
            Redpanda Connect{' '}
            <Badge className="ml-2" tone="default" variant="subtle">
              Recommended
            </Badge>
          </div>
        ),
        content: (
          <div className="mb-4 flex flex-col gap-4">
            <div className="text-body">
              {this.props.isKafkaConnectEnabled
                ? 'Redpanda Connect is an alternative to Kafka Connect. Choose from a growing ecosystem of readily available connectors.'
                : 'Redpanda Connect is a data streaming service for building scalable, high-performance data pipelines that drive real-time analytics and actionable business insights. Integrate data across systems with hundreds of prebuilt connectors, change data capture (CDC) capabilities, and YAML-configurable pipelines.'}{' '}
              <Link
                href={Features.pipelinesApi ? docsLinks.cloud.connectAbout : docsLinks.connect.home}
                rel="noopener noreferrer"
                target="_blank"
              >
                Learn more
              </Link>
            </div>
            <RpConnectTabContent />
          </div>
        ),
      },
      {
        key: ConnectView.KafkaConnect,
        title: <div className="min-w-[180px]">Kafka Connect</div>,
        content: (
          <div className="flex flex-col gap-4">
            <div className="text-body">
              Kafka Connect is our set of managed connectors. These provide a way to integrate your Redpanda data with
              different data systems.{' '}
              <Link href={docsLinks.cloud.managedConnectors} rel="noopener noreferrer" target="_blank">
                Learn more.
              </Link>
            </div>
            <TabKafkaConnect />
          </div>
        ),
      },
    ] as Tab[];

    if (isServerless() || !this.props.isKafkaConnectEnabled) {
      arrayRemoveAll(tabs, (x) => x.key === ConnectView.KafkaConnect);
    }

    return (
      <PageContent>
        {Boolean(this.props.isKafkaConnectEnabled) && (
          <div className="text-body">
            There are two ways to integrate your Redpanda data with data from external systems: Redpanda Connect and
            Kafka Connect.
          </div>
        )}
        {(() => {
          if (tabs.length !== 1) {
            return <Tabs defaultSelectedTabKey={getDefaultView(this.props.defaultView).initialTab} tabs={tabs} />;
          }

          const tabContent = tabs[0].content;
          return typeof tabContent === 'function' ? tabContent() : tabContent;
        })()}
      </PageContent>
    );
  }
}

export { WrapKafkaConnectOverview };
