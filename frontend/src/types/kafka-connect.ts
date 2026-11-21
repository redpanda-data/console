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

// GET "/kafka-connect/clusters"
export type ConnectClusters = {
  // response
  clusterShards: ConnectClusterShard[];
  filtered: {
    clusterCount: number;
    connectorCount: number;
  };
};

export type ConnectClusterShard = {
  // GetClusterShard
  clusterName: string;
  clusterAddress: string;
  clusterInfo: {
    // RootResource
    version: string;
    commit: string;
    kafka_cluster_id: string;
  };

  runningConnectors: number;
  totalConnectors: number;
  runningTasks: number;
  totalTasks: number;

  error?: string;
};

// GET "/kafka-connect/connectors"
export type KafkaConnectors = {
  // response
  clusters: ClusterConnectors[] | null; // only null when isConfigured=false
  isConfigured: boolean;
};

export const ConnectClusterActions = ['viewConnectCluster', 'editConnectCluster', 'deleteConnectCluster'] as const;

export type ConnectClusterAction = 'all' | (typeof ConnectClusterActions)[number];

export type ClusterConnectors = {
  // ClusterConnectors
  clusterName: string;
  clusterAddress: string;
  clusterInfo: {
    version: string;
    commit: string;
    kafka_cluster_id: string;
  };

  totalConnectors: number;
  runningConnectors: number;
  connectors: ClusterConnectorInfo[];
  allowedActions: ConnectClusterAction[] | undefined;

  error?: string;

  // Added by frontend
  canViewCluster: boolean;
  canEditCluster: boolean;
  canDeleteCluster: boolean;
};

// https://docs.confluent.io/home/connect/monitoring.html#connector-and-task-status
export const ConnectorState = {
  Unassigned: 'UNASSIGNED',
  Running: 'RUNNING',
  Paused: 'PAUSED',
  Failed: 'FAILED',
} as const;

export type ConnectorStateType = (typeof ConnectorState)[keyof typeof ConnectorState];

export type ConnectorStatus = 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED' | 'PAUSED' | 'RESTARTING';

export type ConnectorError = {
  type: 'ERROR' | 'WARNING';
  title: string;
  content: string;
};

export type TaskState = ConnectorStateType;

export type ConnectorPossibleStatesLiteral = `${ConnectorStateType}`;

export type ClusterConnectorInfo = {
  name: string;
  class: string; // java class name
  config: object; // map[string]string
  type: string; // Source or Sink
  topic: string; // Kafka Topic name
  state: ConnectorStateType;
  status: ConnectorStatus;
  errors: ConnectorError[];

  totalTasks: number;
  runningTasks: number;
  trace?: string;
  tasks: ClusterConnectorTaskInfo[];

  // added by frontend
  jsonConfig: string;
};

export type ClusterConnectorTaskInfo = {
  taskId: number;
  state: TaskState;
  workerId: string;
  trace?: string; // error message
};

// GET "/kafka-connect/clusters/{clusterName}"
export type ClusterAdditionalInfo = {
  clusterName: string;
  host: string;
  clusterVersion: string;
  plugins: {
    class: string;
    type: 'sink' | 'source';
    version?: string;
  }[];
  enabledFeatures?: string[];
};

// DELETE "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
// PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/pause"  (idempotent)
// PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/resume" (idempotent)
// POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/restart"
// all 4 return either nothing (code 200), or an ApiError

export type ConnectorValidationResult = {
  name: string;
  configs: ConnectorProperty[];
  steps: ConnectorStep[];
};

export type ConnectorStep = {
  name: string;
  description?: string;
  groups: ConnectorGroup[];

  // added by frontend:
  stepIndex: number;
};

export type ConnectorGroup = {
  name?: string;
  description?: string;
  documentation_link?: string;
  config_keys: string[];
};

type ConnectorRecommendedValueEntry = {
  value: string;
  display_name: string;
};

export type ConnectorProperty = {
  definition: {
    name: string;
    type: DataTypeType;
    required: boolean;
    default_value: null | string;
    importance: PropertyImportanceType;
    documentation: string;
    // group: null | string;
    width: PropertyWidthType;
    display_name: string;
    dependents: string[];
    order: number;

    // added by backend
    custom_default_value?: string;
  };
  value: {
    name: string;
    value: null | string;
    recommended_values: string[];
    errors: string[];
    visible: boolean;
  };
  metadata: {
    component_type?: 'RADIO_GROUP';
    recommended_values?: ConnectorRecommendedValueEntry[];
  };
};

export const PropertyImportance = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
} as const;

export type PropertyImportanceType = (typeof PropertyImportance)[keyof typeof PropertyImportance];

export const DataType = {
  Boolean: 'BOOLEAN',
  Class: 'CLASS',
  Int: 'INT',
  List: 'LIST',
  Long: 'LONG',
  Float: 'FLOAT',
  Double: 'DOUBLE',
  Short: 'SHORT',
  String: 'STRING',
  Password: 'PASSWORD',
} as const;

export type DataTypeType = (typeof DataType)[keyof typeof DataType];

export const PropertyWidth = {
  None: 'NONE',
  Short: 'SHORT',
  Medium: 'MEDIUM',
  Long: 'LONG',
} as const;

export type PropertyWidthType = (typeof PropertyWidth)[keyof typeof PropertyWidth];
