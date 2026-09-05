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

import { AlertIcon, CheckCircleIcon, HourglassIcon, PauseCircleIcon, WarningIcon } from 'components/icons';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Button, buttonVariants } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { RedpandaLogo } from 'components/redpanda-ui/components/redpanda-logo';
import { type CSSProperties, type JSX, useState } from 'react';
import { docsLinks } from 'utils/docs-links';
import { showToast } from 'utils/toast.utils';

import AmazonS3 from '../../../assets/connectors/amazon-s3.png';
import ApacheLogo from '../../../assets/connectors/apache.svg';
import CassandraLogo from '../../../assets/connectors/cassandra.png';
import ConfluentLogo from '../../../assets/connectors/confluent.png';
import DB2Logo from '../../../assets/connectors/db2.png';
import DebeziumLogo from '../../../assets/connectors/debezium.png';
import ElasticLogo from '../../../assets/connectors/elastic.svg';
import BigQueryLogo from '../../../assets/connectors/google-bigquery.svg';
import GoogleCloudStorageLogo from '../../../assets/connectors/google-cloud-storage.png';
import PubSubLogo from '../../../assets/connectors/google-pub-sub.svg';
import HdfsLogo from '../../../assets/connectors/hdfs.png';
import IbmMqLogo from '../../../assets/connectors/ibm-mq.svg';
import IcebergLogo from '../../../assets/connectors/iceberg.png';
import JdbcLogo from '../../../assets/connectors/jdbc.png';
import MongoDBLogo from '../../../assets/connectors/mongodb.png';
import MsSqlLogo from '../../../assets/connectors/mssql.png';
import MySqlLogo from '../../../assets/connectors/mysql.svg';
import Neo4jLogo from '../../../assets/connectors/neo4j.svg';
import PostgresqlLogo from '../../../assets/connectors/postgres.png';
import SalesforceLogo from '../../../assets/connectors/salesforce.png';
import ServicenowLogo from '../../../assets/connectors/servicenow.png';
import SnowflakeLogo from '../../../assets/connectors/snowflake.png';
import TwitterLogo from '../../../assets/connectors/twitter.svg';
import { isEmbedded } from '../../../config';
import { api } from '../../../state/backend-api';
import {
  type ApiError,
  type ClusterConnectorInfo,
  type ClusterConnectors,
  type ClusterConnectorTaskInfo,
  ConnectorState,
  type ConnectorStatus,
} from '../../../state/rest-interfaces';
import { ZeroSizeWrapper } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { Statistic } from '../../misc/statistic';

type ConnectorMetadata = {
  readonly className?: string; // match by exact match
  readonly classNamePrefix?: string; // match by prefix

  readonly logo?: JSX.Element;
  readonly friendlyName?: string; // override display name (instead of just 'className without namespace')
  readonly description?: string;
  readonly learnMoreLink?: string;
  readonly author?: string;
};

const fallbackConnector: ConnectorMetadata = {
  logo: <RedpandaLogo className="connectorLogo" variant="mark" />,
};

// Order of entries matters:
// - first step is checking if there is any exact match for 'className'
// - second step is going through the list and taking the first entry where 'classNamePrefix' matches
const connectorMetadata: ConnectorMetadata[] = [
  // Apache Connectors
  {
    classNamePrefix: 'org.apache.kafka.connect.mirror.MirrorSourceConnector',
    logo: <img alt="Apache Software Foundation logo" className="connectorLogo" src={ApacheLogo} />,
    author: 'Apache Software Foundation',
    friendlyName: 'Kafka cluster topics',
    description: 'Imports messages from another Kafka cluster, using MirrorSourceConnector',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-mmaker-source-connector'),
  } as const,
  {
    classNamePrefix: 'org.apache.kafka.connect.mirror.MirrorCheckpointConnector',
    logo: <img alt="Apache Software Foundation logo" className="connectorLogo" src={ApacheLogo} />,
    author: 'Apache Software Foundation',
    friendlyName: 'Kafka cluster offsets',
    description: 'Imports consumer group offsets from another Kafka cluster, using MirrorCheckpointConnector',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-mmaker-checkpoint-connector'),
  } as const,
  {
    classNamePrefix: 'org.apache.kafka.connect.mirror.MirrorHeartbeatConnector',
    logo: <img alt="Apache Software Foundation logo" className="connectorLogo" src={ApacheLogo} />,
    author: 'Apache Software Foundation',
    friendlyName: 'Heartbeat',
    description: 'Generates heartbeat messages to local heartbeat topic',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-mmaker-heartbeat-connector'),
  } as const,
  // Confluent Connectors
  {
    classNamePrefix: 'io.confluent.connect.hdfs.',
    logo: <img alt="HDFS logo" className="connectorLogo" src={HdfsLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.s3.',
    logo: <img alt="Amazon S3 logo" className="connectorLogo" src={AmazonS3} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.jms.',
    logo: <img alt="JMS logo" className="connectorLogo" src={JdbcLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.jdbc.',
    logo: <img alt="JDBC logo" className="connectorLogo" src={JdbcLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.salesforce.',
    logo: <img alt="Salesforce logo" className="connectorLogo" src={SalesforceLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.servicenow.',
    logo: <img alt="Servicenow logo" className="connectorLogo" src={ServicenowLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.elasticsearch.',
    logo: <img alt="Elastic logo" className="connectorLogo" src={ElasticLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.gcp.pubsub.',
    logo: <img alt="Google PubSub logo" className="connectorLogo" src={PubSubLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'io.confluent.connect.cassandra.',
    logo: <img alt="Cassandra logo" className="connectorLogo" src={CassandraLogo} />,
    author: 'Confluent',
  } as const,

  // Debezium Connectors
  {
    classNamePrefix: 'io.debezium.connector.mysql.',
    logo: <img alt="MySQL logo" className="connectorLogo" src={MySqlLogo} />,
    author: 'Debezium',
    friendlyName: 'MySQL (Debezium)',
    description: 'Imports a stream of changes from MySQL, Amazon RDS and Amazon Aurora',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-mysql-source-connector'),
  } as const,
  {
    classNamePrefix: 'io.debezium.connector.mongodb.',
    logo: <img alt="MongoDB logo" className="connectorLogo" src={MongoDBLogo} />,
    author: 'Debezium',
  } as const,
  {
    classNamePrefix: 'io.debezium.connector.postgresql.',
    logo: <img alt="PostgreSQL logo" className="connectorLogo" src={PostgresqlLogo} />,
    author: 'Debezium',
    friendlyName: 'PostgreSQL (Debezium)',
    description: 'Imports a stream of changes from PostgreSQL',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-postgresql-connector'),
  } as const,
  {
    classNamePrefix: 'io.debezium.connector.sqlserver.',
    logo: <img alt="Microsoft SQL Server logo" className="connectorLogo" src={MsSqlLogo} />,
    author: 'Debezium',
    friendlyName: 'SQL Server (Debezium)',
    description: 'Imports a stream of changes from Microsoft SQL Server',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-sqlserver-connector'),
  } as const,
  {
    classNamePrefix: 'io.debezium.connector.cassandra.',
    logo: <img alt="Cassandra logo" className="connectorLogo" src={CassandraLogo} />,
    author: 'Debezium',
  } as const,
  {
    classNamePrefix: 'io.debezium.connector.db2.',
    logo: <img alt="IBM DB2 logo" className="connectorLogo" src={DB2Logo} />,
    author: 'Debezium',
  } as const,

  // Redpanda Connectors
  {
    classNamePrefix: 'com.redpanda.kafka.connect.s3.',
    logo: <img alt="Amazon S3 logo" className="connectorLogo" src={AmazonS3} />,
    author: 'Redpanda',
    friendlyName: 'S3',
    description: 'Exports messages to files in S3 buckets',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-s3-sink-connector'),
  } as const,
  {
    classNamePrefix: 'com.redpanda.kafka.connect.gcs.',
    logo: <img alt="Google Cloud Storage logo" className="connectorLogo" src={GoogleCloudStorageLogo} />,
    author: 'Redpanda',
    friendlyName: 'Google Cloud Storage',
    description: 'Exports messages to files in Google Cloud Storage',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-gcs-connector'),
  } as const,
  {
    classNamePrefix: 'com.redpanda.kafka.connect.jdbc.JdbcSourceConnector',
    logo: <RedpandaLogo className="connectorLogo" variant="mark" />,
    author: 'Redpanda',
    friendlyName: 'JDBC',
    description: 'Imports batches of rows from MySQL, PostgreSQL, SQLite and SQL Server',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-jdbc-source-connector'),
  } as const,
  {
    classNamePrefix: 'com.redpanda.kafka.connect.jdbc.JdbcSinkConnector',
    logo: <RedpandaLogo className="connectorLogo" variant="mark" />,
    author: 'Redpanda',
    friendlyName: 'JDBC',
    description: 'Exports messages to tables in MySQL, PostgreSQL, SQLite and SQL Server',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-jdbc-sink-connector'),
  } as const,

  // Stream Reactor / Lenses
  {
    classNamePrefix: 'com.datamountaineer.streamreactor.connect.cassandra.',
    logo: <img alt="Cassandra logo" className="connectorLogo" src={CassandraLogo} />,
    author: 'Lenses',
  } as const,

  // WePay Connectors
  {
    classNamePrefix: 'com.wepay.kafka.connect.bigquery.',
    logo: <img alt="Google BigQuery logo" className="connectorLogo" src={BigQueryLogo} />,
    author: 'WePay',
    friendlyName: 'Google BigQuery',
    description: 'Exports messages to Google BigQuery tables',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-gcp-bigquery-connector'),
  } as const,

  // Snowflake Connectors
  {
    classNamePrefix: 'com.snowflake.kafka.connector',
    logo: <img alt="Snowflake logo" className="connectorLogo" src={SnowflakeLogo} />,
    author: 'Snowflake',
    friendlyName: 'Snowflake',
    description: 'Exports messages to Snowflake tables',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-snowflake-connector'),
  } as const,

  // MongoDB Connectors
  {
    classNamePrefix: 'com.mongodb.kafka.connect.MongoSourceConnector',
    logo: <img alt="MongoDB logo" className="connectorLogo" src={MongoDBLogo} />,
    author: 'MongoDB',
    friendlyName: 'MongoDB',
    description: 'Imports collections from MongoDB',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-mongodb-source-connector'),
  } as const,
  {
    classNamePrefix: 'com.mongodb.kafka.connect.MongoSinkConnector',
    logo: <img alt="MongoDB logo" className="connectorLogo" src={MongoDBLogo} />,
    author: 'MongoDB',
    friendlyName: 'MongoDB',
    description: 'Exports messages to MongoDB collections',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-mongodb-sink-connector'),
  } as const,

  // Iceberg Connectors
  {
    classNamePrefix: 'org.apache.iceberg.connect.IcebergSinkConnector',
    logo: <img alt="Iceberg logo" className="connectorLogo" src={IcebergLogo} />,
    author: 'Tabular',
    friendlyName: 'Iceberg',
    description: 'Exports messages to Iceberg tables',
    learnMoreLink: docsLinks.cloud.managedConnectorGuide('create-iceberg-sink-connector'),
  } as const,

  // JMS Connectors
  {
    classNamePrefix: 'io.macronova.kafka.connect.jms.JmsSinkConnector',
    logo: <RedpandaLogo className="connectorLogo" variant="mark" />,
    author: 'MacroNova',
    friendlyName: 'JMS',
    description: 'Exports messages to JMS queue',
    learnMoreLink: docsLinks.cloud.managedConnectors,
  } as const,
  {
    classNamePrefix: 'io.macronova.kafka.connect.jms.JmsSourceConnector',
    logo: <RedpandaLogo className="connectorLogo" variant="mark" />,
    author: 'MacroNova',
    friendlyName: 'JMS',
    description: 'Imports messages from JMS queue',
    learnMoreLink: docsLinks.cloud.managedConnectors,
  } as const,

  // IBM MQ Connectors
  {
    classNamePrefix: 'com.ibm.eventstreams.connect.mqsink.MQSinkConnector',
    logo: <img alt="IBM MQ Logo" className="connectorLogo" src={IbmMqLogo} />,
    author: 'IBM Messaging',
    friendlyName: 'IBM MQ',
    description: 'Exports messages to IBM MQ queue',
    learnMoreLink: docsLinks.cloud.managedConnectors,
  } as const,
  {
    classNamePrefix: 'com.ibm.eventstreams.connect.mqsource.MQSourceConnector',
    logo: <img alt="IBM MQ Logo" className="connectorLogo" src={IbmMqLogo} />,
    author: 'IBM Messaging',
    friendlyName: 'IBM MQ',
    description: 'Imports messages from IBM MQ queue',
    learnMoreLink: docsLinks.cloud.managedConnectors,
  } as const,

  // Community Connector
  {
    classNamePrefix: 'com.github.jcustenborder.kafka.connect.twitter',
    logo: <img alt="Twitter logo" className="connectorLogo" src={TwitterLogo} />,
    author: 'Jcustenborder',
  } as const,
  {
    classNamePrefix: 'streams.kafka.connect.sink.Neo4jSinkConnector',
    logo: <img alt="Neo4j logo" className="connectorLogo" src={Neo4jLogo} />,
    author: 'Neo4j Streams',
  } as const,
  {
    classNamePrefix: 'com.github.castorm.kafka.connect.http.HttpSourceConnector',
    logo: <RedpandaLogo className="connectorLogo" variant="mark" />,
    author: 'Cástor Rodríguez',
    friendlyName: 'HTTP',
    description: 'Imports data from HTTP services as batches or increments',
    learnMoreLink: docsLinks.cloud.managedConnectors,
  } as const,

  // Fallbacks with a very generous classname prefix (usually just the maintainers' logo)
  {
    classNamePrefix: 'io.debezium.',
    logo: <img alt="Debezium logo" className="connectorLogo" src={DebeziumLogo} />,
    author: 'Debezium',
  } as const,
  {
    classNamePrefix: 'io.confluent.',
    logo: <img alt="Confluent logo" className="connectorLogo" src={ConfluentLogo} />,
    author: 'Confluent',
  } as const,
  {
    classNamePrefix: 'com.redpanda.',
    logo: <RedpandaLogo className="connectorLogo" variant="mark" />,
    author: 'Redpanda',
  } as const,
  {
    classNamePrefix: 'org.apache.kafka.',
    logo: <img alt="Apache Software Foundation logo" className="connectorLogo" src={ApacheLogo} />,
    author: 'Apache Software Foundation',
  } as const,
];

const connectorMetadataMatchCache: {
  [className: string]: ConnectorMetadata;
} = {};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
export function findConnectorMetadata(className: string): ConnectorMetadata | null {
  const c = className;

  // Quick and dirty cache
  // If cache has too many entries, remove some
  const cacheKeys = Object.keys(connectorMetadataMatchCache);
  if (cacheKeys.length > 200) {
    for (const k of cacheKeys.slice(0, 5)) {
      delete connectorMetadataMatchCache[k];
    }
  }

  // try find in cache
  let meta = connectorMetadataMatchCache[c];
  if (meta) {
    return meta;
  }

  // look for exact match
  for (const e of connectorMetadata) {
    if (e.className && e.className === c) {
      meta = e;
      break;
    }
  }

  // look for prefix match
  if (!meta) {
    for (const e of connectorMetadata) {
      if (e.classNamePrefix && c.startsWith(e.classNamePrefix)) {
        meta = e;
        break;
      }
    }
  }

  // use fallback icon
  if (!meta) {
    meta = fallbackConnector;
  }

  // store entry in cache
  connectorMetadataMatchCache[c] = meta;
  return meta;
}

export const ConnectorClass = (props: { observable: { class: string } }) => {
  const c = props.observable.class;
  const meta = findConnectorMetadata(c);
  const displayName = meta?.friendlyName ?? removeNamespace(c);

  return (
    <div style={{ height: '1px', overflow: 'visible', display: 'flex', alignItems: 'center' }}>
      {meta?.logo ? (
        <span style={{ verticalAlign: 'inherit', marginRight: '5px' }}>
          <ZeroSizeWrapper transform="translateY(-1px)" width="22px">
            <div style={{ width: '22px', height: '22px' }}>{meta.logo}</div>
          </ZeroSizeWrapper>
        </span>
      ) : null}

      <Popover>
        <PopoverTrigger render={<button type="button">{displayName}</button>} />
        {/* PopoverContent is a fixed `w-72`; Chakra's `size="stretch"` sized to content. */}
        <PopoverContent className="w-auto max-w-[500px]" side="right">
          <div className="whitespace-pre-wrap">{c}</div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export function removeNamespace(className: string): string {
  if (!className) {
    return className;
  }

  const lastDot = className.lastIndexOf('.');
  if (lastDot >= 0) {
    return className.slice(lastDot + 1, undefined);
  }

  return className;
}

export const OverviewStatisticsCard = () => {
  const totalClusters = api.connectConnectors?.clusters?.length ?? '...';
  const totalConnectors = api.connectConnectors?.clusters?.sum((c) => c.totalConnectors) ?? '...';

  return (
    <Section className="py-4">
      <div className="flex gap-8">
        <Statistic title="Connect Clusters" value={totalClusters} />
        <Statistic title="Total Connectors" value={totalConnectors} />
      </div>
    </Section>
  );
};

export const ClusterStatisticsCard = (p: { clusterName: string }) => {
  if (isEmbedded()) {
    return null;
  }

  const cluster = api.connectConnectors?.clusters?.first((x) => x.clusterName === p.clusterName);

  const runningConnectors = cluster?.runningConnectors ?? '...';
  const totalConnectors = cluster?.totalConnectors ?? '...';

  const addr = cluster?.clusterAddress ?? '...';
  const version = cluster?.clusterInfo.version ?? '...';

  return (
    <Section className="py-4">
      <div className="flex gap-8">
        <Statistic title="Cluster" value={cluster?.clusterName} />

        <Statistic title="Connectors" value={`${runningConnectors} / ${totalConnectors}`} />
        <Statistic title="Address" value={addr} />
        <Statistic title="Version" value={version} />
      </div>
    </Section>
  );
};

export const ConnectorStatisticsCard = (p: { clusterName: string; connectorName: string }) => {
  const cluster = api.connectConnectors?.clusters?.first((x) => x.clusterName === p.clusterName);
  const connector = cluster?.connectors.first((x) => x.name === p.connectorName);

  return (
    <Section className="py-4">
      <div className="flex gap-8">
        <Statistic title="Cluster" value={cluster?.clusterName} />
        <Statistic title="Connector" value={connector?.name} />

        <Statistic title="Tasks" value={`${connector?.runningTasks} / ${connector?.totalTasks}`} />
      </div>
    </Section>
  );
};

export function NotConfigured() {
  return (
    <PageContent key="b">
      <Section>
        {/* Same shape as the already-migrated SchemaNotConfiguredPage. */}
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Not configured</EmptyTitle>
            <EmptyDescription>
              Kafka Connect is not configured in Redpanda Console. Set up the connection details to your Kafka Connect
              cluster in your Redpanda Console config, to view and control all your connectors and tasks.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <a
              className={buttonVariants({ variant: 'primary' })}
              href={docsLinks.selfManaged.console}
              rel="noopener noreferrer"
              target="_blank"
            >
              Redpanda Console Config Documentation
            </a>
          </EmptyContent>
        </Empty>
      </Section>
    </PageContent>
  );
}

type ConfirmModalProps<T> = {
  target: () => T | null; // when set, dialog is shown
  clearTarget: () => void; // called when the dialog is done

  content: (target: T) => JSX.Element; // "are you sure you want to ..."
  successMessage: (target: T) => JSX.Element; // "x done successfully"

  onOk: (target: T) => Promise<void>;
  onSuccess?: (target: T) => void; // called after the success toast; use for navigation
};

export const ConfirmModal = <T,>(props: ConfirmModalProps<T>) => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | Error | null>(null);

  const renderError = (): { title: string; content: string } | undefined => {
    if (!error) {
      return;
    }

    const txt = typeof error === 'string' ? error : error.message;

    // try parsing as json
    let apiErr: ApiError | undefined;
    try {
      apiErr = JSON.parse(txt) as ApiError;
      if (!(apiErr?.message && apiErr.statusCode)) {
        apiErr = undefined;
      }
    } catch {
      apiErr = undefined;
    }

    // return text only
    if (!apiErr) {
      return {
        title: 'Error',
        content: txt,
      };
    }

    // render error object
    return {
      title: `${apiErr.statusCode}`,
      content: apiErr.message,
    };
  };

  const cancel = () => {
    setIsPending(false);
    setError(null);
    props.clearTarget();
  };

  const success = (successTarget: T) => {
    const messageContent = props.successMessage(successTarget);
    showToast({
      status: 'success',
      description: messageContent,
    });

    cancel();
    props.onSuccess?.(successTarget);
  };

  const onOk = async () => {
    setIsPending(true);
    // biome-ignore lint/style/noNonNullAssertion: guaranteed by isOpen check
    const target = props.target()!;
    try {
      await props.onOk(target);
      success(target);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsPending(false);
    }
  };

  const target = props.target();
  const err = renderError();

  const content = target && props.content(target);

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          cancel();
        }
      }}
      open={target !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm</AlertDialogTitle>
        </AlertDialogHeader>
        {/* min-h-0 + overflow-y-auto: AlertDialogContent is `overflow-hidden max-h-[85vh]`, so a
            long API error would otherwise be clipped with no way to scroll to the footer. */}
        <AlertDialogDescription className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {content}
          {err ? (
            <div className="mt-4">
              <Alert icon={<AlertIcon />} variant="destructive">
                <AlertDescription>
                  <div>
                    <h3 className="text-heading-xs">{err.title}</h3>
                    <div>{err.content}</div>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </AlertDialogDescription>
        <AlertDialogFooter>
          {/* Cancel first, as `leastDestructiveRef` made it the initial focus. */}
          <Button onClick={cancel} variant="outline">
            No
          </Button>
          <Button isLoading={isPending} onClick={onOk}>
            {error ? 'Retry' : 'Yes'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Takes an observable object that is either a single connector (runningTasks and totalTasks properties)
// or an array of connectors (in which case it will show the sum)

export const TasksColumn = (props: { observable: ClusterConnectors | ClusterConnectorInfo }) => {
  const obs = props.observable;

  let running = 0;
  let total = 0;

  if ('error' in obs && obs.error !== null) {
    return null;
  }

  if ('clusterName' in obs) {
    // ClusterConnectors
    if (obs.error) {
      return null;
    }
    running = obs.connectors.sum((x) => x.runningTasks);
    total = obs.connectors.sum((x) => x.totalTasks);
  } else if ('name' in obs) {
    // ClusterConnectorInfo
    running = obs.runningTasks;
    total = obs.totalTasks;
  }

  return (
    <>
      {running < total ? <span style={mr05}>{warnIcon}</span> : null}
      <span>
        {running} / {total}
      </span>
    </>
  );
};

type ConnectorInfo = { runningConnectors: number; totalConnectors: number; error?: string };
export const ConnectorsColumn = (props: { observable: ConnectorInfo | ConnectorInfo[] }) => {
  let running = 0;
  let total = 0;
  let error: string | undefined;
  if ('runningConnectors' in props.observable) {
    running = props.observable.runningConnectors;
    total = props.observable.totalConnectors;
    error = props.observable.error;
  } else {
    if (props.observable.length === 0) {
      return null;
    }
    error = props.observable[0].error;
    running = props.observable.sum((x) => x.runningConnectors);
    total = props.observable.sum((x) => x.totalConnectors);
  }

  if (error) {
    return null;
  }

  return (
    <>
      {running < total ? <span style={mr05}>{warnIcon}</span> : null}
      <span>
        {running} / {total}
      </span>
    </>
  );
};

export const TaskState = (p: {
  observable: { state: ClusterConnectorTaskInfo['state']; trace?: string; taskId?: number };
}) => {
  const [err, showErr] = useState(undefined as string | undefined);

  const task = p.observable;
  const state = task.state;

  const iconWrapper = (iconElement: JSX.Element) => <span style={{ fontSize: '18px' }}>{iconElement}</span>;

  let icon: JSX.Element = <></>;
  if (state === ConnectorState.Running) {
    icon = iconWrapper(okIcon);
  }
  if (state === ConnectorState.Failed) {
    icon = iconWrapper(errIcon);
  }
  if (state === ConnectorState.Paused) {
    icon = iconWrapper(pauseIcon);
  }
  if (state === ConnectorState.Unassigned) {
    icon = iconWrapper(waitIcon);
  }

  let stateContent = (
    <span className="capitalize" style={{ display: 'flex', alignItems: 'center', gap: '4px', height: 'auto' }}>
      {icon}
      {String(state).toLowerCase()}
    </span>
  );

  let errBtn: JSX.Element | undefined;
  let errModal: JSX.Element | undefined;
  if (task.trace) {
    errBtn = (
      <Button
        onClick={() => showErr(task.trace)}
        style={{
          padding: '0px 12px',
          display: 'inline-flex',
          alignItems: 'center',
          height: '30px',
          gap: '5px',
        }}
        variant="destructive-outline"
      >
        {stateContent}
        <span>(Show Error)</span>
      </Button>
    );

    const close = () => showErr(undefined);
    errModal = (
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        open={err !== null && err !== undefined}
      >
        <DialogContent size="full">
          <DialogHeader>
            <DialogTitle>
              {task.taskId === null ? 'Error in Connector' : `Error trace of task ${task.taskId}`}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="codeBox w-full overflow-scroll whitespace-pre px-2 py-3">{err}</div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={close}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    stateContent = errBtn;
  }

  return (
    <div>
      {stateContent}
      {errModal}
    </div>
  );
};

export const okIcon = <CheckCircleIcon className="text-success" />;
export const warnIcon = <WarningIcon color="orange" />;
export const errIcon = <AlertIcon color="orangered" />;
const waitIcon = <HourglassIcon color="#888" />;
const pauseIcon = (
  <span style={{ color: '#555' }}>
    <PauseCircleIcon />
  </span>
);

export const mr05: CSSProperties = { marginRight: '.5em' };
export const ml05: CSSProperties = { marginLeft: '.5em' };

/**
 * Health status to a background utility.
 *
 * These were Chakra theme tokens (`green.500`), which only resolved through a Chakra style prop —
 * as raw CSS they are invalid and the declaration is dropped, so the status stripe painted nothing.
 */
export const statusColors = {
  HEALTHY: 'bg-success-strong',
  UNHEALTHY: 'bg-destructive-strong',
  DEGRADED: 'bg-warning-strong',
  PAUSED: 'bg-surface-disabled',
  RESTARTING: 'bg-informative-strong',
  UNASSIGNED: 'bg-surface-disabled',
  DESTROYED: 'bg-destructive-strong',
  UNKNOWN: 'bg-surface-disabled',
} as Record<ConnectorStatus, string>;
