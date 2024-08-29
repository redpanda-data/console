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
	dataplanev1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

type mapper struct{}

func (m mapper) connectorsHTTPResponseToProto(httpResponse kafkaconnect.ClusterConnectors) (*dataplanev1alpha2.ListConnectorsResponse, error) {
	connectors := make([]*dataplanev1alpha2.ListConnectorsResponse_ConnectorInfoStatus, len(httpResponse.Connectors))

	for i, connector := range httpResponse.Connectors {
		errors, err := m.connectorErrorsToProto(connector.Errors)
		if err != nil {
			return nil, fmt.Errorf("failed to map connector error to proto for connector %q: %w", connector.Name, err)
		}

		connectors[i] = &dataplanev1alpha2.ListConnectorsResponse_ConnectorInfoStatus{
			Name: connector.Name,
		}

		connectors[i].Info = &dataplanev1alpha2.ConnectorSpec{
			Name:   connector.Name,
			Type:   connector.Type,
			Config: connector.Config,
			Tasks:  m.taskInfoListToProtoInfo(connector.Name, connector.Tasks),
		}

		connectors[i].Status = &dataplanev1alpha2.ConnectorStatus{
			Name: connector.Name,
			Connector: &dataplanev1alpha2.ConnectorStatus_Connector{
				State:    connector.State,
				WorkerId: connector.WorkerID,
				Trace:    connector.Trace,
			},
			Tasks:         m.taskInfoListToProtoStatus(connector.Tasks),
			Type:          connector.Type,
			Errors:        errors,
			HolisticState: m.holisticStateToProto(connector.Status),
		}
	}

	return &dataplanev1alpha2.ListConnectorsResponse{
		Connectors: connectors,
	}, nil
}

func (m mapper) taskInfoListToProtoInfo(connectorName string, taskInfoList []kafkaconnect.ClusterConnectorTaskInfo) []*dataplanev1alpha2.TaskInfo {
	tasks := make([]*dataplanev1alpha2.TaskInfo, len(taskInfoList))
	for i, task := range taskInfoList {
		tasks[i] = m.taskToProto(connectorName, task.TaskID)
	}
	return tasks
}

func (m mapper) connectorTaskIDToProto(connectorName string, taskInfoList []con.ConnectorTaskID) []*dataplanev1alpha2.TaskInfo {
	tasks := make([]*dataplanev1alpha2.TaskInfo, len(taskInfoList))
	for i, task := range taskInfoList {
		tasks[i] = m.taskToProto(connectorName, task.Task)
	}
	return tasks
}

func (mapper) taskToProto(name string, taskID int) *dataplanev1alpha2.TaskInfo {
	return &dataplanev1alpha2.TaskInfo{
		Connector: name,
		Task:      int32(taskID),
	}
}

func (mapper) taskInfoListToProtoStatus(taskInfoList []kafkaconnect.ClusterConnectorTaskInfo) []*dataplanev1alpha2.TaskStatus {
	tasks := make([]*dataplanev1alpha2.TaskStatus, len(taskInfoList))
	for i, task := range taskInfoList {
		tasks[i] = &dataplanev1alpha2.TaskStatus{
			Id:       int32(task.TaskID),
			State:    task.State,
			WorkerId: task.WorkerID,
			Trace:    task.Trace,
		}
	}
	return tasks
}

func (mapper) holisticStateToProto(state string) dataplanev1alpha2.ConnectorHolisticState {
	switch state {
	case kafkaconnect.ConnectorStatusPaused:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_PAUSED
	case kafkaconnect.ConnectorStatusStopped:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_STOPPED
	case kafkaconnect.ConnectorStatusRestarting:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_RESTARTING
	case kafkaconnect.ConnectorStatusDestroyed:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DESTROYED
	case kafkaconnect.ConnectorStatusUnassigned:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNASSIGNED
	case kafkaconnect.ConnectorStatusHealthy:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_HEALTHY
	case kafkaconnect.ConnectorStatusUnhealthy:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNHEALTHY
	case kafkaconnect.ConnectorStatusDegraded:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DEGRADED
	default:
		return dataplanev1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNKNOWN
	}
}

func (m mapper) connectorErrorsToProto(errorInfoList []kafkaconnect.ClusterConnectorInfoError) ([]*dataplanev1alpha2.ConnectorError, error) {
	connectErrors := make([]*dataplanev1alpha2.ConnectorError, len(errorInfoList))
	for i, errorInfoItem := range errorInfoList {
		errorType, err := m.connectorErrorTypeToProto(errorInfoItem.Type)
		if err != nil {
			return nil, err
		}
		connectErrors[i] = &dataplanev1alpha2.ConnectorError{
			Title:   errorInfoItem.Title,
			Content: errorInfoItem.Content,
			Type:    errorType,
		}
	}
	return connectErrors, nil
}

func (mapper) connectorErrorTypeToProto(errorType string) (dataplanev1alpha2.ConnectorError_Type, error) {
	switch errorType {
	case "ERROR":
		return dataplanev1alpha2.ConnectorError_TYPE_ERROR, nil
	case "WARNING":
		return dataplanev1alpha2.ConnectorError_TYPE_WARNING, nil
	default:
		return dataplanev1alpha2.ConnectorError_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given error type %q to proto", errorType)
	}
}

func (mapper) createConnectorProtoToClientRequest(createConnector *dataplanev1alpha2.CreateConnectorRequest) (*con.CreateConnectorRequest, error) {
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

func (m mapper) clusterInfoToProto(clusterInfo kafkaconnect.ClusterInfo) *dataplanev1alpha2.ConnectCluster {
	return &dataplanev1alpha2.ConnectCluster{
		Name:    clusterInfo.Name,
		Address: clusterInfo.Host,
		Info: &dataplanev1alpha2.ConnectCluster_Info{
			Version:        clusterInfo.Version,
			Commit:         clusterInfo.Commit,
			KafkaClusterId: clusterInfo.KafkaClusterID,
		},
		Plugins: m.connectPluginsToProto(clusterInfo.Plugins),
	}
}

func (mapper) connectPluginsToProto(plugins []con.ConnectorPluginInfo) []*dataplanev1alpha2.ConnectorPlugin {
	pluginsProtoList := make([]*dataplanev1alpha2.ConnectorPlugin, len(plugins))

	for i, plugin := range plugins {
		pluginsProtoList[i] = &dataplanev1alpha2.ConnectorPlugin{
			Type:    plugin.Type,
			Version: plugin.Version,
			Class:   plugin.Class,
		}
	}

	return pluginsProtoList
}

func (m mapper) connectorInfoListToProto(connectorInfoList []kafkaconnect.ClusterInfoWithError) ([]*dataplanev1alpha2.ConnectCluster, error) {
	clusters := make([]*dataplanev1alpha2.ConnectCluster, len(connectorInfoList))
	var errs error
	for i, connectorInfo := range connectorInfoList {
		if connectorInfo.RequestError != nil {
			errs = errors.Join(errs, fmt.Errorf("failed to get connector info for connector %q: %w", connectorInfo.Name, connectorInfo.RequestError))
			// continue so we don't pannic in case of an error
			continue
		}
		clusters[i] = &dataplanev1alpha2.ConnectCluster{
			Name:    connectorInfo.Name,
			Address: connectorInfo.Host,
			Info: &dataplanev1alpha2.ConnectCluster_Info{
				Version:        connectorInfo.Version,
				Commit:         connectorInfo.Commit,
				KafkaClusterId: connectorInfo.KafkaClusterID,
			},
			Plugins: m.connectPluginsToProto(connectorInfo.Plugins),
		}
	}
	return clusters, errs
}

// connectorSpecToProto converts the http response to proto message
func (mapper) connectorSpecToProto(connector con.ConnectorInfo) *dataplanev1alpha2.ConnectorSpec {
	tasks := make([]*dataplanev1alpha2.TaskInfo, len(connector.Tasks))

	for i, task := range connector.Tasks {
		tasks[i] = &dataplanev1alpha2.TaskInfo{
			Connector: task.Connector,
			Task:      int32(task.Task),
		}
	}
	return &dataplanev1alpha2.ConnectorSpec{
		Name:   connector.Name,
		Config: connector.Config,
		Tasks:  tasks,
		Type:   connector.Type,
	}
}

func (m mapper) connectorStatusToProto(status kafkaconnect.ConnectorStatus) (*dataplanev1alpha2.ConnectorStatus, error) {
	errors, err := m.connectorErrorsToProto(status.Errors)
	if err != nil {
		return nil, fmt.Errorf("failed to map connector error to proto for connector %q: %w", status.Name, err)
	}
	return &dataplanev1alpha2.ConnectorStatus{
		Name: status.Name,
		Connector: &dataplanev1alpha2.ConnectorStatus_Connector{
			State:    status.Connector.State,
			WorkerId: status.Connector.WorkerID,
			Trace:    status.Connector.Trace,
		},
		Type:          status.Type,
		Errors:        errors,
		Tasks:         m.taskInfoListToProtoStatus(status.Tasks),
		HolisticState: m.holisticStateToProto(status.State),
	}, nil
}

// convertStringMapToInterfaceMap converts interface map to string map
func convertStringMapToInterfaceMap(stringMap map[string]string) map[string]any {
	interfaceMap := make(map[string]any, len(stringMap))
	for key, value := range stringMap {
		interfaceMap[key] = value
	}
	return interfaceMap
}
