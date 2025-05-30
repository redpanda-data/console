// @generated by protoc-gen-connect-query v2.0.1 with parameter "target=ts,js_import_style=legacy_commonjs"
// @generated from file redpanda/api/dataplane/v1alpha1/kafka_connect.proto (package redpanda.api.dataplane.v1alpha1, syntax proto3)
/* eslint-disable */

import { KafkaConnectService } from "./kafka_connect_pb";

/**
 * ListConnectClusters implements the list clusters method, list connect
 * clusters available in the console configuration
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.ListConnectClusters
 * @deprecated
 */
export const listConnectClusters = KafkaConnectService.method.listConnectClusters;

/**
 * GetConnectCluster implements the get cluster info method, exposes a Kafka
 * Connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.GetConnectCluster
 * @deprecated
 */
export const getConnectCluster = KafkaConnectService.method.getConnectCluster;

/**
 * ListConnectors implements the list connectors method, exposes a Kafka
 * Connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.ListConnectors
 * @deprecated
 */
export const listConnectors = KafkaConnectService.method.listConnectors;

/**
 * CreateConnector implements the create connector method, and exposes an
 * equivalent REST endpoint as the Kafka connect API endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.CreateConnector
 * @deprecated
 */
export const createConnector = KafkaConnectService.method.createConnector;

/**
 * RestartConnector implements the restart connector method, exposes a Kafka
 * Connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.RestartConnector
 * @deprecated
 */
export const restartConnector = KafkaConnectService.method.restartConnector;

/**
 * GetConnector implements the get connector method, exposes a Kafka
 * Connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.GetConnector
 * @deprecated
 */
export const getConnector = KafkaConnectService.method.getConnector;

/**
 * GetConnectorStatus implement the get status method, Gets the current status of the connector, including:
 * Whether it is running or restarting, or if it has failed or paused
 * Which worker it is assigned to
 * Error information if it has failed
 * The state of all its tasks
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.GetConnectorStatus
 * @deprecated
 */
export const getConnectorStatus = KafkaConnectService.method.getConnectorStatus;

/**
 * PauseConnector implements the pause connector method, exposes a Kafka
 * connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.PauseConnector
 * @deprecated
 */
export const pauseConnector = KafkaConnectService.method.pauseConnector;

/**
 * ResumeConnector implements the resume connector method, exposes a Kafka
 * connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.ResumeConnector
 * @deprecated
 */
export const resumeConnector = KafkaConnectService.method.resumeConnector;

/**
 * StopConnector implements the stop connector method, exposes a Kafka
 * connect equivalent REST endpoint it stops the connector but does not
 * delete the connector. All tasks for the connector are shut down completely
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.StopConnector
 * @deprecated
 */
export const stopConnector = KafkaConnectService.method.stopConnector;

/**
 * DeleteConnector implements the delete connector method, exposes a Kafka
 * connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.DeleteConnector
 */
export const deleteConnector = KafkaConnectService.method.deleteConnector;

/**
 * UpsertConector implements the update or create connector method, it
 * exposes a kafka connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.UpsertConnector
 * @deprecated
 */
export const upsertConnector = KafkaConnectService.method.upsertConnector;

/**
 * GetConnectorConfig implements the get connector configuration method, expose a kafka connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.GetConnectorConfig
 * @deprecated
 */
export const getConnectorConfig = KafkaConnectService.method.getConnectorConfig;

/**
 * ListConnectorTopics implements the list connector topics method, expose a kafka connect equivalent REST endpoint
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.ListConnectorTopics
 * @deprecated
 */
export const listConnectorTopics = KafkaConnectService.method.listConnectorTopics;

/**
 * ResetConnectorTopics implements the reset connector topics method, expose a kafka connect equivalent REST endpoint
 * the request body is empty.
 *
 * @generated from rpc redpanda.api.dataplane.v1alpha1.KafkaConnectService.ResetConnectorTopics
 * @deprecated
 */
export const resetConnectorTopics = KafkaConnectService.method.resetConnectorTopics;
