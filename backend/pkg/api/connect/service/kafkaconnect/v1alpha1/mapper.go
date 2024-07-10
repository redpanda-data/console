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

func mapv1alpha1ToListKafkaConnectorsv1alpha2(m *v1alpha1.ListConnectorsRequest) *v1alpha2.ListConnectorsRequest {
	return &v1alpha2.ListConnectorsRequest{
		ClusterName: m.GetClusterName(),
		PageToken:   m.GetPageToken(),
		PageSize:    m.GetPageSize(),
	}
}

func mapv1alpha2ConnectorsTov1alpha1(connectors []*v1alpha2.ListConnectorsResponse_ConnectorInfoStatus) []*v1alpha1.ListConnectorsResponse_ConnectorInfoStatus {
	out := make([]*v1alpha1.ListConnectorsResponse_ConnectorInfoStatus, 0, len(connectors))

	for _, c := range connectors {
		out = append(out, &v1alpha1.ListConnectorsResponse_ConnectorInfoStatus{
			Name:   c.GetName(),
			Info:   mapv1alpha2ConnectorSpecTov1alpha1(c.Info),
			Status: mapv1alpha2ConnectorStatusTov1alpha1(c.Status),
		})
	}

	return out
}

func mapv1alpha1ToCreateKafkaConnectorv1alpha2(m *v1alpha1.CreateConnectorRequest) *v1alpha2.CreateConnectorRequest {
	return &v1alpha2.CreateConnectorRequest{
		ClusterName: m.GetClusterName(),
		Connector:   mapv1alpha1ConnectorSpecTov1alpha2(m.Connector),
	}
}

func mapv1alpha2ConnectorSpecTov1alpha1(spec *v1alpha2.ConnectorSpec) *v1alpha1.ConnectorSpec {
	if spec == nil {
		return nil
	}

	tasks := make([]*v1alpha1.TaskInfo, 0, len(spec.GetTasks()))
	for _, ti := range spec.GetTasks() {
		tasks = append(tasks, &v1alpha1.TaskInfo{
			Connector: ti.GetConnector(),
			Task:      ti.GetTask(),
		})
	}

	return &v1alpha1.ConnectorSpec{
		Name:   spec.GetName(),
		Config: spec.GetConfig(),
		Type:   spec.GetType(),
		Tasks:  tasks,
	}
}

func mapv1alpha1ConnectorSpecTov1alpha2(spec *v1alpha1.ConnectorSpec) *v1alpha2.ConnectorSpec {
	if spec == nil {
		return nil
	}

	tasks := make([]*v1alpha2.TaskInfo, 0, len(spec.GetTasks()))
	for _, ti := range spec.GetTasks() {
		tasks = append(tasks, &v1alpha2.TaskInfo{
			Connector: ti.GetConnector(),
			Task:      ti.GetTask(),
		})
	}

	return &v1alpha2.ConnectorSpec{
		Name:   spec.GetName(),
		Config: spec.GetConfig(),
		Type:   spec.GetType(),
		Tasks:  tasks,
	}
}

func mapv1alpha1ToGetKafkaConnectorv1alpha2(m *v1alpha1.GetConnectorRequest) *v1alpha2.GetConnectorRequest {
	return &v1alpha2.GetConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ToGetKafkaConnectClusterv1alpha2(m *v1alpha1.GetConnectClusterRequest) *v1alpha2.GetConnectClusterRequest {
	return &v1alpha2.GetConnectClusterRequest{
		ClusterName: m.GetClusterName(),
	}
}

func mapv1alpha1ToGetKafkaConnectorStatusv1alpha2(m *v1alpha1.GetConnectorStatusRequest) *v1alpha2.GetConnectorStatusRequest {
	return &v1alpha2.GetConnectorStatusRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha2ConnectorStatusTov1alpha1(status *v1alpha2.ConnectorStatus) *v1alpha1.ConnectorStatus {
	if status == nil {
		return nil
	}

	var stc *v1alpha1.ConnectorStatus_Connector
	if status.Connector != nil {
		stc = &v1alpha1.ConnectorStatus_Connector{
			State:    status.Connector.GetState(),
			WorkerId: status.Connector.GetWorkerId(),
			Trace:    status.Connector.GetTrace(),
		}
	}

	tasks := make([]*v1alpha1.TaskStatus, 0, len(status.GetTasks()))
	for _, ts := range status.GetTasks() {
		tasks = append(tasks, &v1alpha1.TaskStatus{
			Id:       ts.GetId(),
			State:    ts.GetState(),
			WorkerId: ts.GetWorkerId(),
			Trace:    ts.GetTrace(),
		})
	}

	errors := make([]*v1alpha1.ConnectorError, 0, len(status.GetErrors()))
	for _, e := range status.GetErrors() {
		errors = append(errors, &v1alpha1.ConnectorError{
			Title:   e.GetTitle(),
			Content: e.GetContent(),
			Type:    v1alpha1.ConnectorError_Type(e.GetType()),
		})
	}

	return &v1alpha1.ConnectorStatus{
		Connector:     stc,
		Name:          status.GetName(),
		Tasks:         tasks,
		Type:          status.GetType(),
		HolisticState: v1alpha1.ConnectorHolisticState(status.GetHolisticState()),
		Errors:        errors,
	}
}

func mapv1alpha1ToResumeKafkaConnectorv1alpha2(m *v1alpha1.ResumeConnectorRequest) *v1alpha2.ResumeConnectorRequest {
	return &v1alpha2.ResumeConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ToPauseKafkaConnectorv1alpha2(m *v1alpha1.PauseConnectorRequest) *v1alpha2.PauseConnectorRequest {
	return &v1alpha2.PauseConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ToDeleteKafkaConnectorv1alpha2(m *v1alpha1.DeleteConnectorRequest) *v1alpha2.DeleteConnectorRequest {
	return &v1alpha2.DeleteConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ToRestartKafkaConnectorv1alpha2(m *v1alpha1.RestartConnectorRequest) *v1alpha2.RestartConnectorRequest {
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

func mapv1alpha1ToStopKafkaConnectorv1alpha2(m *v1alpha1.StopConnectorRequest) *v1alpha2.StopConnectorRequest {
	return &v1alpha2.StopConnectorRequest{
		ClusterName: m.GetClusterName(),
		Name:        m.GetName(),
	}
}

func mapv1alpha1ToListKafkaConnectClustersv1alpha2(_ *v1alpha1.ListConnectClustersRequest) *v1alpha2.ListConnectClustersRequest {
	return &v1alpha2.ListConnectClustersRequest{}
}

func mapv1alpha2KafkaConnectClustersTov1alpha1(clusters []*v1alpha2.ConnectCluster) []*v1alpha1.ConnectCluster {
	out := make([]*v1alpha1.ConnectCluster, 0, len(clusters))

	for _, c := range clusters {
		out = append(out, mapv1alpha2KafkaConnectClusterTov1alpha1(c))
	}
	return out
}

func mapv1alpha2KafkaConnectClusterTov1alpha1(cluster *v1alpha2.ConnectCluster) *v1alpha1.ConnectCluster {
	if cluster == nil {
		return nil
	}

	var info *v1alpha1.ConnectCluster_Info
	if cluster.Info != nil {
		info = &v1alpha1.ConnectCluster_Info{
			Version:        cluster.Info.GetVersion(),
			Commit:         cluster.Info.GetCommit(),
			KafkaClusterId: cluster.Info.GetKafkaClusterId(),
		}
	}

	plugins := make([]*v1alpha1.ConnectorPlugin, 0, len(cluster.GetPlugins()))
	for _, p := range cluster.GetPlugins() {
		plugins = append(plugins, &v1alpha1.ConnectorPlugin{
			Type:    p.GetType(),
			Version: p.GetVersion(),
			Class:   p.GetClass(),
		})
	}

	return &v1alpha1.ConnectCluster{
		Name:    cluster.Name,
		Address: cluster.Address,
		Info:    info,
		Plugins: plugins,
	}
}

func mapv1alpha1ToUpsertKafkaConnectorv1alpha2(m *v1alpha1.UpsertConnectorRequest) *v1alpha2.UpsertConnectorRequest {
	return &v1alpha2.UpsertConnectorRequest{
		Name:        m.GetName(),
		ClusterName: m.GetClusterName(),
		Config:      m.GetConfig(),
	}
}

func mapv1alpha1ToGetConnectorConfigv1alpha2(m *v1alpha1.GetConnectorConfigRequest) *v1alpha2.GetConnectorConfigRequest {
	return &v1alpha2.GetConnectorConfigRequest{
		Name:        m.GetName(),
		ClusterName: m.GetClusterName(),
	}
}

func mapv1alpha1ToListConnectorTopicsv1alpha2(m *v1alpha1.ListConnectorTopicsRequest) *v1alpha2.ListConnectorTopicsRequest {
	return &v1alpha2.ListConnectorTopicsRequest{
		Name:        m.GetName(),
		ClusterName: m.GetClusterName(),
	}
}

func mapv1alpha1ToResetConnectorTopicsv1alpha2(m *v1alpha1.ResetConnectorTopicsRequest) *v1alpha2.ResetConnectorTopicsRequest {
	return &v1alpha2.ResetConnectorTopicsRequest{
		Name:        m.GetName(),
		ClusterName: m.GetClusterName(),
	}
}
