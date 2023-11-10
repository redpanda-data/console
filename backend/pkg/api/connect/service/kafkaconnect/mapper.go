// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package kafkaconnect implements the KafkaConnect interface for the Connect API.
package kafkaconnect

import (
	"errors"
	"fmt"

	con "github.com/cloudhut/connect-client"

	kafkaconnect "github.com/redpanda-data/console/backend/pkg/connect"
	dataplanev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

type mapper struct{}

func (m mapper) connectorsHTTPResponseToProto(httpResponse kafkaconnect.ClusterConnectors) (*dataplanev1alpha1.ListConnectorsResponse, error) {
	connectors := make([]*dataplanev1alpha1.ListConnectorsResponse_ConnectorInfoStatus, len(httpResponse.Connectors))

	for i, connector := range httpResponse.Connectors {
		errors, err := m.connectorErrorsToProto(connector.Errors)
		if err != nil {
			return nil, fmt.Errorf("failed to map connector error to proto for connector %q: %w", connector.Name, err)
		}

		connectors[i] = &dataplanev1alpha1.ListConnectorsResponse_ConnectorInfoStatus{
			Name:          connector.Name,
			HolisticState: m.holisticStateToProto(connector.Status),
			Errors:        errors,
		}

		connectors[i].Info = &dataplanev1alpha1.ConnectorSpec{
			Name:   connector.Name,
			Type:   connector.Type,
			Config: connector.Config,
			Tasks:  m.taskInfoListToProtoInfo(connector.Name, connector.Tasks),
		}

		connectors[i].Status = &dataplanev1alpha1.ConnectorStatus{
			Name: connector.Name,
			Connector: &dataplanev1alpha1.ConnectorStatus_Connector{
				State:    connector.State,
				WorkerId: connector.WorkerID,
			},
			Tasks: m.taskInfoListToProtoStatus(connector.Tasks),
			Type:  connector.Type,
			Trace: connector.Trace,
		}
	}

	return &dataplanev1alpha1.ListConnectorsResponse{
		Connectors: connectors,
	}, nil
}

func (m mapper) taskInfoListToProtoInfo(connectorName string, taskInfoList []kafkaconnect.ClusterConnectorTaskInfo) []*dataplanev1alpha1.TaskInfo {
	tasks := make([]*dataplanev1alpha1.TaskInfo, len(taskInfoList))
	for i, task := range taskInfoList {
		tasks[i] = m.taskToProto(connectorName, task.TaskID)
	}
	return tasks
}

func (m mapper) connectorTaskIDToProto(connectorName string, taskInfoList []con.ConnectorTaskID) []*dataplanev1alpha1.TaskInfo {
	tasks := make([]*dataplanev1alpha1.TaskInfo, len(taskInfoList))
	for i, task := range taskInfoList {
		tasks[i] = m.taskToProto(connectorName, task.Task)
	}
	return tasks
}

func (mapper) taskToProto(name string, taskID int) *dataplanev1alpha1.TaskInfo {
	return &dataplanev1alpha1.TaskInfo{
		Connector: name,
		Task:      int32(taskID),
	}
}

func (mapper) taskInfoListToProtoStatus(taskInfoList []kafkaconnect.ClusterConnectorTaskInfo) []*dataplanev1alpha1.TaskStatus {
	tasks := make([]*dataplanev1alpha1.TaskStatus, len(taskInfoList))
	for i, task := range taskInfoList {
		tasks[i] = &dataplanev1alpha1.TaskStatus{
			Id:       int32(task.TaskID),
			State:    task.State,
			WorkerId: task.WorkerID,
			Trace:    task.Trace,
		}
	}
	return tasks
}

func (mapper) holisticStateToProto(state string) dataplanev1alpha1.ConnectorHolisticState {
	switch state {
	case kafkaconnect.ConnectorStatusPaused:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_PAUSED
	case kafkaconnect.ConnectorStatusStopped:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_STOPPED
	case kafkaconnect.ConnectorStatusRestarting:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_RESTARTING
	case kafkaconnect.ConnectorStatusDestroyed:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DESTROYED
	case kafkaconnect.ConnectorStatusUnassigned:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNASSIGNED
	case kafkaconnect.ConnectorStatusHealthy:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_HEALTHY
	case kafkaconnect.ConnectorStatusUnhealthy:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNHEALTHY
	case kafkaconnect.ConnectorStatusDegraded:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DEGRADED
	default:
		return dataplanev1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNKNOWN
	}
}

func (m mapper) connectorErrorsToProto(errorInfoList []kafkaconnect.ClusterConnectorInfoError) ([]*dataplanev1alpha1.ConnectorError, error) {
	connectErrors := make([]*dataplanev1alpha1.ConnectorError, len(errorInfoList))
	for i, errorInfoItem := range errorInfoList {
		errorType, err := m.connectorErrorTypeToProto(errorInfoItem.Type)
		if err != nil {
			return nil, err
		}
		connectErrors[i] = &dataplanev1alpha1.ConnectorError{
			Title:   errorInfoItem.Title,
			Content: errorInfoItem.Content,
			Type:    errorType,
		}
	}
	return connectErrors, nil
}

func (mapper) connectorErrorTypeToProto(errorType string) (dataplanev1alpha1.ConnectorError_Type, error) {
	switch errorType {
	case "ERROR":
		return dataplanev1alpha1.ConnectorError_TYPE_ERROR, nil
	case "WARNING":
		return dataplanev1alpha1.ConnectorError_TYPE_WARNING, nil
	default:
		return dataplanev1alpha1.ConnectorError_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given error type %q to proto", errorType)
	}
}

func (mapper) createConnectorProtoToClientRequest(createConnector *dataplanev1alpha1.CreateConnectorRequest) (*con.CreateConnectorRequest, error) {
	if createConnector == nil || createConnector.Connector == nil {
		return nil, fmt.Errorf("create connector request is nil")
	}

	if len(createConnector.Connector.Config) == 0 {
		return nil, fmt.Errorf("create connector request config is empty")
	}

	return &con.CreateConnectorRequest{
		Name:   createConnector.Connector.Name,
		Config: convertStringMapToInterfaceMap(createConnector.Connector.Config),
	}, nil
}

func (m mapper) ClusterInfoToProto(clusterInfo kafkaconnect.ClusterInfo) (*dataplanev1alpha1.ConnectCluster, error) {
	return &dataplanev1alpha1.ConnectCluster{
		Name:    clusterInfo.Name,
		Address: clusterInfo.Host,
		Info: &dataplanev1alpha1.ConnectCluster_Info{
			Version:        clusterInfo.Version,
			Commit:         clusterInfo.Commit,
			KafkaClusterId: clusterInfo.KafkaClusterID,
		},
		Plugins: m.connectPluginsToProto(clusterInfo.Plugins),
	}, nil
}

func (mapper) connectPluginsToProto(plugins []con.ConnectorPluginInfo) []*dataplanev1alpha1.ConnectorPlugin {
	pluginsProtoList := make([]*dataplanev1alpha1.ConnectorPlugin, len(plugins))

	for i, plugin := range plugins {
		pluginsProtoList[i] = &dataplanev1alpha1.ConnectorPlugin{
			Type:    plugin.Type,
			Version: plugin.Version,
			Class:   plugin.Class,
		}
	}

	return pluginsProtoList
}

func (m mapper) connectorInfoListToProto(connectorInfoList []kafkaconnect.ClusterInfoWithError) ([]*dataplanev1alpha1.ConnectCluster, error) {
	clusters := make([]*dataplanev1alpha1.ConnectCluster, len(connectorInfoList))
	var errs error
	for i, connectorInfo := range connectorInfoList {
		if connectorInfo.RequestError != nil {
			errs = errors.Join(errs, fmt.Errorf("failed to get connector info for connector %q: %w", connectorInfo.Name, connectorInfo.RequestError))
			// continue so we don't pannic in case of an error
			continue
		}
		clusters[i] = &dataplanev1alpha1.ConnectCluster{
			Name:    connectorInfo.Name,
			Address: connectorInfo.Host,
			Info: &dataplanev1alpha1.ConnectCluster_Info{
				Version:        connectorInfo.Version,
				Commit:         connectorInfo.Commit,
				KafkaClusterId: connectorInfo.KafkaClusterID,
			},
			Plugins: m.connectPluginsToProto(connectorInfo.Plugins),
		}
	}
	return clusters, errs
}

// convertStringMapToInterfaceMap converts interface map to string map
func convertStringMapToInterfaceMap(stringMap map[string]string) map[string]interface{} {
	interfaceMap := make(map[string]interface{}, len(stringMap))
	for key, value := range stringMap {
		interfaceMap[key] = value
	}
	return interfaceMap
}
