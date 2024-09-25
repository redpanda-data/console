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
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

func mapv1alpha1ToListConnectorsv1alpha2(m *v1alpha1.ListConnectorsRequest) *v1alpha2.ListConnectorsRequest {
	return &v1alpha2.ListConnectorsRequest{
		ClusterName: m.GetClusterName(),
		PageSize:    m.GetPageSize(),
		PageToken:   m.GetPageToken(),
	}
}

func mapv1alpha2ConnectorsTov1alpha2(infos []*v1alpha2.ListConnectorsResponse_ConnectorInfoStatus) []*v1alpha1.ListConnectorsResponse_ConnectorInfoStatus {
	out := make([]*v1alpha1.ListConnectorsResponse_ConnectorInfoStatus, 0, len(infos))
	for _, st := range infos {
		out = append(out, &v1alpha1.ListConnectorsResponse_ConnectorInfoStatus{
			Name:   st.GetName(),
			Info:   mapv1alpha2ConnectorSpecTov1alpha1(st.Info),
			Status: mapv1alpha2ConnectorStatusTov1alpha1(st.GetStatus()),
		})
	}
	return out
}

func mapv1alpha2ConnectorSpecTov1alpha1(m *v1alpha2.ConnectorSpec) *v1alpha1.ConnectorSpec {
	return &v1alpha1.ConnectorSpec{
		Name:   m.GetName(),
		Config: m.Config,
		Tasks:  mapv1alpha2ConnectorTaskInfoTov1alpha1(m.GetTasks()),
		Type:   m.GetType(),
	}
}

func mapv1alpha2ConnectorTaskInfoTov1alpha1(tasks []*v1alpha2.TaskInfo) []*v1alpha1.TaskInfo {
	out := make([]*v1alpha1.TaskInfo, 0, len(tasks))

	for _, t := range tasks {
		out = append(out, &v1alpha1.TaskInfo{
			Connector: t.GetConnector(),
			Task:      t.GetTask(),
		})
	}

	return out
}

func mapv1alpha2ConnectorStatusTov1alpha1(m *v1alpha2.ConnectorStatus) *v1alpha1.ConnectorStatus {
	tasks := make([]*v1alpha1.TaskStatus, 0, len(m.GetTasks()))
	for _, ts := range m.GetTasks() {
		tasks = append(tasks, &v1alpha1.TaskStatus{
			Id:       ts.GetId(),
			State:    ts.GetState(),
			WorkerId: ts.GetWorkerId(),
			Trace:    ts.GetTrace(),
		})
	}

	errors := make([]*v1alpha1.ConnectorError, 0, len(m.GetErrors()))
	for _, err := range m.GetErrors() {
		errors = append(errors, &v1alpha1.ConnectorError{
			Type:    mapv1alpha2ConnectorErrorTypeTov1alpha1(err.GetType()),
			Title:   err.GetTitle(),
			Content: err.GetContent(),
		})
	}

	return &v1alpha1.ConnectorStatus{
		Name: m.GetName(),
		Connector: &v1alpha1.ConnectorStatus_Connector{
			State:    m.GetConnector().GetState(),
			WorkerId: m.GetConnector().GetWorkerId(),
			Trace:    m.GetConnector().GetTrace(),
		},
		Tasks:         tasks,
		Type:          m.GetType(),
		HolisticState: mapv1alpha2ConnectorHolisticStateTov1alpha1(m.GetHolisticState()),
		Errors:        errors,
	}
}

func mapv1alpha2ConnectorErrorTypeTov1alpha1(m v1alpha2.ConnectorError_Type) v1alpha1.ConnectorError_Type {
	switch m {
	case v1alpha2.ConnectorError_TYPE_WARNING:
		return v1alpha1.ConnectorError_TYPE_WARNING
	case v1alpha2.ConnectorError_TYPE_ERROR:
		return v1alpha1.ConnectorError_TYPE_ERROR
	default:
		return v1alpha1.ConnectorError_TYPE_UNSPECIFIED
	}
}

func mapv1alpha2ConnectorHolisticStateTov1alpha1(m v1alpha2.ConnectorHolisticState) v1alpha1.ConnectorHolisticState {
	switch m {
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_PAUSED:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_PAUSED
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_RESTARTING:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_RESTARTING
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DESTROYED:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DESTROYED
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_STOPPED:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_STOPPED
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNASSIGNED:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNASSIGNED
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_HEALTHY:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_HEALTHY
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNHEALTHY:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNHEALTHY
	case v1alpha2.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DEGRADED:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_DEGRADED
	default:
		return v1alpha1.ConnectorHolisticState_CONNECTOR_HOLISTIC_STATE_UNSPECIFIED
	}
}

func mapv1alpha1ToCreateConnectorv1alpha2(m *v1alpha1.CreateConnectorRequest) *v1alpha2.CreateConnectorRequest {
	return &v1alpha2.CreateConnectorRequest{
		ClusterName: m.GetClusterName(),
		Connector:   mapv1alpha1ConnectorSpecTov1alpha2(m.GetConnector()),
	}
}

func mapv1alpha1ConnectorSpecTov1alpha2(m *v1alpha1.ConnectorSpec) *v1alpha2.ConnectorSpec {
	return &v1alpha2.ConnectorSpec{
		Name:   m.GetName(),
		Config: m.Config,
		Tasks:  mapv1alpha1ConnectorTaskInfoTov1alpha2(m.GetTasks()),
		Type:   m.GetType(),
	}
}

func mapv1alpha1ConnectorTaskInfoTov1alpha2(tasks []*v1alpha1.TaskInfo) []*v1alpha2.TaskInfo {
	out := make([]*v1alpha2.TaskInfo, 0, len(tasks))

	for _, t := range tasks {
		out = append(out, &v1alpha2.TaskInfo{
			Connector: t.GetConnector(),
			Task:      t.GetTask(),
		})
	}

	return out
}

func mapv1alpha1ToGetConnectorv1alpha2(m *v1alpha1.GetConnectorRequest) *v1alpha2.GetConnectorRequest {
	return &v1alpha2.GetConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ToGetConnectorStatusv1alpha2(m *v1alpha1.GetConnectorStatusRequest) *v1alpha2.GetConnectorStatusRequest {
	return &v1alpha2.GetConnectorStatusRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ResumeConnectorv1alpha2(m *v1alpha1.ResumeConnectorRequest) *v1alpha2.ResumeConnectorRequest {
	return &v1alpha2.ResumeConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1PauseConnectorv1alpha2(m *v1alpha1.PauseConnectorRequest) *v1alpha2.PauseConnectorRequest {
	return &v1alpha2.PauseConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1DeleteConnectorv1alpha2(m *v1alpha1.DeleteConnectorRequest) *v1alpha2.DeleteConnectorRequest {
	return &v1alpha2.DeleteConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1RestartConnectorv1alpha2(m *v1alpha1.RestartConnectorRequest) *v1alpha2.RestartConnectorRequest {
	var opts *v1alpha2.RestartConnectorRequest_Options
	if m.Options != nil {
		opts = &v1alpha2.RestartConnectorRequest_Options{
			IncludeTasks: m.Options.IncludeTasks,
			OnlyFailed:   m.Options.OnlyFailed,
		}
	}

	return &v1alpha2.RestartConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
		Options:     opts,
	}
}

func mapv1alpha1StopConnectorv1alpha2(m *v1alpha1.StopConnectorRequest) *v1alpha2.StopConnectorRequest {
	return &v1alpha2.StopConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ListConnectClustersv1alpha2(_ *v1alpha1.ListConnectClustersRequest) *v1alpha2.ListConnectClustersRequest {
	return &v1alpha2.ListConnectClustersRequest{}
}

func mapv1alpha2ConnectClusterTov1alpha1(c *v1alpha2.ConnectCluster) *v1alpha1.ConnectCluster {
	var info *v1alpha1.ConnectCluster_Info
	if c.Info != nil {
		info = &v1alpha1.ConnectCluster_Info{
			Version:        c.GetInfo().Version,
			Commit:         c.GetInfo().Commit,
			KafkaClusterId: c.GetInfo().KafkaClusterId,
		}
	}

	plugins := make([]*v1alpha1.ConnectorPlugin, 0, len(c.GetPlugins()))

	for _, p := range c.GetPlugins() {
		plugins = append(plugins, &v1alpha1.ConnectorPlugin{
			Type:    p.GetType(),
			Version: p.GetVersion(),
			Class:   p.GetClass(),
		})
	}

	return &v1alpha1.ConnectCluster{
		Name:    c.GetName(),
		Address: c.GetAddress(),
		Info:    info,
		Plugins: plugins,
	}
}

func mapv1alpha2ConnectClustersTov1alpha1(clusters []*v1alpha2.ConnectCluster) []*v1alpha1.ConnectCluster {
	out := make([]*v1alpha1.ConnectCluster, 0, len(clusters))

	for _, c := range clusters {
		out = append(out, mapv1alpha2ConnectClusterTov1alpha1(c))
	}

	return out
}

func mapv1alpha1GetConnectClusterv1alpha2(m *v1alpha1.GetConnectClusterRequest) *v1alpha2.GetConnectClusterRequest {
	return &v1alpha2.GetConnectClusterRequest{
		ClusterName: m.GetClusterName(),
	}
}

func mapv1alpha1UpsertConnectorv1alpha2(m *v1alpha1.UpsertConnectorRequest) *v1alpha2.UpsertConnectorRequest {
	return &v1alpha2.UpsertConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
		Config:      m.Config,
	}
}

func mapv1alpha1GetConnectorConfigv1alpha2(m *v1alpha1.GetConnectorConfigRequest) *v1alpha2.GetConnectorConfigRequest {
	return &v1alpha2.GetConnectorConfigRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ListConnectorTopicsv1alpha2(m *v1alpha1.ListConnectorTopicsRequest) *v1alpha2.ListConnectorTopicsRequest {
	return &v1alpha2.ListConnectorTopicsRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ResetConnectorTopicsv1alpha2(m *v1alpha1.ResetConnectorTopicsRequest) *v1alpha2.ResetConnectorTopicsRequest {
	return &v1alpha2.ResetConnectorTopicsRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}
