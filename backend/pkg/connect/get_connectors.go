// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import (
	"context"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	con "github.com/cloudhut/connect-client"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/redpanda-data/console/backend/pkg/config"
)

type connectorState = string

const (
	connectorStateUnassigned connectorState = "UNASSIGNED"
	connectorStateRunning    connectorState = "RUNNING"
	connectorStatePaused     connectorState = "PAUSED"
	connectorStateFAILED     connectorState = "FAILED"
)

// ClusterConnectors contains all available information about the deployed connectors
// in a single Kafka connect cluster.
type ClusterConnectors struct {
	ClusterName    string           `json:"clusterName"`
	ClusterAddress string           `json:"clusterAddress"`
	ClusterInfo    con.RootResource `json:"clusterInfo"`

	TotalConnectors   int                    `json:"totalConnectors"`
	RunningConnectors int                    `json:"runningConnectors"`
	Connectors        []ClusterConnectorInfo `json:"connectors"`
	Error             string                 `json:"error,omitempty"`

	// This is set at the HTTP handler level as this will be returned by the Hooks.
	AllowedActions []string `json:"allowedActions"`
}

// ClusterConnectorInfo contains all information we can retrieve about a single
// connector in a Kafka connect cluster.
type ClusterConnectorInfo struct {
	Name         string                     `json:"name"`
	Class        string                     `json:"class"`
	Config       map[string]string          `json:"config"`
	Type         string                     `json:"type"`  // Source or Sink
	Topic        string                     `json:"topic"` // Kafka Topic name
	State        string                     `json:"state"` // Running, ..
	TotalTasks   int                        `json:"totalTasks"`
	RunningTasks int                        `json:"runningTasks"`
	Trace        string                     `json:"trace,omitempty"`
	Tasks        []ClusterConnectorTaskInfo `json:"tasks"`
}

// ClusterConnectorTaskInfo provides information about a connector's task.
type ClusterConnectorTaskInfo struct {
	TaskID   int    `json:"taskId"`
	State    string `json:"state"`
	WorkerID string `json:"workerId"`
	Trace    string `json:"trace,omitempty"` // only set if the task is errored
}

// GetAllClusterConnectors returns the merged GET /connectors responses across all configured Connect clusters. Requests will be
// sent concurrently. Context timeout should be configured correctly in order to not await responses from offline clusters
// for too long.
func (s *Service) GetAllClusterConnectors(ctx context.Context) ([]*ClusterConnectors, error) {
	if !s.Cfg.Enabled {
		return nil, ErrKafkaConnectNotConfigured
	}

	ch := make(chan *ClusterConnectors, len(s.ClientsByCluster))
	for _, cluster := range s.ClientsByCluster {
		go func(cfg config.ConnectCluster, c *con.Client) {
			connectors, err := c.ListConnectorsExpanded(ctx)
			errMsg := ""
			if err != nil {
				s.Logger.Warn("failed to list connectors from Kafka connect cluster",
					zap.String("cluster_name", cfg.Name), zap.String("cluster_address", cfg.URL), zap.Error(err))
				errMsg = err.Error()

				ch <- &ClusterConnectors{
					ClusterName:    cfg.Name,
					ClusterAddress: cfg.URL,
					Connectors:     listConnectorsExpandedToClusterConnectorInfo(connectors),
					Error:          errMsg,
				}
				return
			}

			root, err := c.GetRoot(ctx)
			if err != nil {
				s.Logger.Warn("failed to list root resource from Kafka connect cluster",
					zap.String("cluster_name", cfg.Name), zap.String("cluster_address", cfg.URL), zap.Error(err))
				errMsg = err.Error()
			}

			totalConnectors := 0
			runningConnectors := 0
			for _, connector := range connectors {
				totalConnectors++
				if connector.Status.Connector.State == connectorStateRunning {
					runningConnectors++
				}
			}

			ch <- &ClusterConnectors{
				ClusterName:       cfg.Name,
				ClusterAddress:    cfg.URL,
				ClusterInfo:       root,
				TotalConnectors:   totalConnectors,
				RunningConnectors: runningConnectors,
				Connectors:        listConnectorsExpandedToClusterConnectorInfo(connectors),
				Error:             errMsg,
			}
		}(cluster.Cfg, cluster.Client)
	}

	// Consume all list connector responses and merge them into a single array.
	shards := make([]*ClusterConnectors, cap(ch))
	for i := 0; i < cap(ch); i++ {
		shards[i] = <-ch
	}
	return shards, nil
}

// GetClusterConnectors returns the GET /connectors response for a single connect cluster. A cluster can be referenced
// by it's name (as specified in the user config).
func (s *Service) GetClusterConnectors(ctx context.Context, clusterName string) (ClusterConnectors, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return ClusterConnectors{}, restErr
	}

	connectors, err := c.Client.ListConnectorsExpanded(ctx)
	errMsg := ""
	if err != nil {
		s.Logger.Warn("failed to list connectors from Kafka connect cluster",
			zap.String("cluster_name", c.Cfg.Name), zap.String("cluster_address", c.Cfg.URL), zap.Error(err))
		errMsg = err.Error()
	}

	return ClusterConnectors{
		ClusterName:    c.Cfg.Name,
		ClusterAddress: c.Cfg.URL,
		Connectors:     listConnectorsExpandedToClusterConnectorInfo(connectors),
		Error:          errMsg,
	}, nil
}

// GetConnector requests the connector info as well as the status info and merges both information together. If either
// request fails an error will be returned.
func (s *Service) GetConnector(ctx context.Context, clusterName string, connector string) (ClusterConnectorInfo, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return ClusterConnectorInfo{}, restErr
	}

	cInfo, err := c.Client.GetConnector(ctx, connector)
	if err != nil {
		return ClusterConnectorInfo{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get connector info: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	stateInfo, err := c.Client.GetConnectorStatus(ctx, connector)
	if err != nil {
		return ClusterConnectorInfo{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get connector state: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	tasks := make([]ClusterConnectorTaskInfo, len(stateInfo.Tasks))
	runningTasks := 0
	for i, task := range stateInfo.Tasks {
		tasks[i] = ClusterConnectorTaskInfo{
			TaskID:   task.ID,
			State:    task.State,
			WorkerID: task.WorkerID,
			Trace:    task.Trace,
		}
		if task.State == connectorStateRunning {
			runningTasks++
		}
	}

	return ClusterConnectorInfo{
		Name:         cInfo.Name,
		Class:        getMapValueOrString(cInfo.Config, "connector.class", "unknown"),
		Config:       cInfo.Config,
		Type:         cInfo.Type,
		State:        stateInfo.Connector.State,
		Topic:        getMapValueOrString(cInfo.Config, "kafka.topic", "unknown"),
		TotalTasks:   len(stateInfo.Tasks),
		RunningTasks: runningTasks,
		Tasks:        tasks,
	}, nil
}

func listConnectorsExpandedToClusterConnectorInfo(l map[string]con.ListConnectorsResponseExpanded) []ClusterConnectorInfo {
	if l == nil {
		return []ClusterConnectorInfo{}
	}

	connectorInfo := make([]ClusterConnectorInfo, 0, len(l))
	for _, c := range l {
		tasks := make([]ClusterConnectorTaskInfo, len(c.Status.Tasks))
		runningTasks := 0
		for i, task := range c.Status.Tasks {
			tasks[i] = ClusterConnectorTaskInfo{
				TaskID:   task.ID,
				State:    task.State,
				WorkerID: task.WorkerID,
				Trace:    task.Trace,
			}
			if task.State == connectorStateRunning {
				runningTasks++
			}
		}

		connectorInfo = append(connectorInfo, ClusterConnectorInfo{
			Name:         c.Info.Name,
			Class:        getMapValueOrString(c.Info.Config, "connector.class", "unknown"),
			Topic:        getMapValueOrString(c.Info.Config, "kafka.topic", "unknown"),
			Config:       c.Info.Config,
			Type:         c.Info.Type,
			State:        c.Status.Connector.State,
			Tasks:        tasks,
			Trace:        c.Status.Connector.Trace,
			TotalTasks:   len(c.Status.Tasks),
			RunningTasks: runningTasks,
		})
	}

	return connectorInfo
}
