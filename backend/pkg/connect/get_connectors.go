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
	"strings"

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
	connectorStateStopped    connectorState = "STOPPED"
	connectorStateFailed     connectorState = "FAILED"
	connectorStateRestarting connectorState = "RESTARTING"
	connectorStateDestroyed  connectorState = "DESTROYED"
)

// connectorStatus is our holistic unified connector status that takes into account not just the
// connector instance state, but also state of all the tasks within the connector
type connectorStatus = string

const (
	// ConnectorStatusHealthy Connector is in running state, > 0 tasks, all of
	// them in running state.
	ConnectorStatusHealthy connectorStatus = "HEALTHY"
	// ConnectorStatusUnhealthy Connector is failed state.
	//   Or Connector is in running state but has 0 tasks.
	//   Or Connector is in running state, has > 0 tasks, and all tasks are in
	//   failed state.
	ConnectorStatusUnhealthy connectorStatus = "UNHEALTHY"
	// ConnectorStatusDegraded Connector is in running state, has > 0 tasks, but
	// has at least one state in failed state, but not all tasks are failed.
	ConnectorStatusDegraded connectorStatus = "DEGRADED"
	// ConnectorStatusPaused Connector is administratively paused
	ConnectorStatusPaused connectorStatus = "PAUSED"
	// ConnectorStatusStopped Connector has been stopped
	ConnectorStatusStopped connectorStatus = "STOPPED"
	// ConnectorStatusRestarting Connector is either actively restarting or is
	// expected to restart soon
	ConnectorStatusRestarting connectorStatus = "RESTARTING"
	// ConnectorStatusUnassigned Connector is in unassigned state. Or Connector
	// is in running state, and there are unassigned tasks.
	ConnectorStatusUnassigned connectorStatus = "UNASSIGNED"
	// ConnectorStatusDestroyed Connector is in destroyed state, regardless of any tasks.
	ConnectorStatusDestroyed connectorStatus = "DESTROYED"
	// ConnectorStatusUnknown Connector statate coudn't be determined
	ConnectorStatusUnknown connectorStatus = "UNKNOWN"
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
	Name         string                      `json:"name"`
	Class        string                      `json:"class"`
	Config       map[string]string           `json:"config"`
	Type         string                      `json:"type"`  // Source or Sink
	Topic        string                      `json:"topic"` // Kafka Topic name
	State        connectorState              `json:"state"` // Running, ..
	Status       connectorStatus             `json:"status"`
	WorkerID     string                      `json:"workerId"`
	TotalTasks   int                         `json:"totalTasks"`
	RunningTasks int                         `json:"runningTasks"`
	Trace        string                      `json:"trace,omitempty"`
	Errors       []ClusterConnectorInfoError `json:"errors"`
	Tasks        []ClusterConnectorTaskInfo  `json:"tasks"`
}

type connectorErrorType = string

const (
	connectorErrorTypeError   = "ERROR"
	connectorErrorTypeWarning = "WARNING"
)

// ClusterConnectorInfoError provides nicer information about connector errors gathered from connector traces
type ClusterConnectorInfoError struct {
	Type    connectorErrorType `json:"type"`
	Title   string             `json:"title"`
	Content string             `json:"content"`
}

// ClusterConnectorTaskInfo provides information about a connector's task.
type ClusterConnectorTaskInfo struct {
	TaskID   int    `json:"taskId"`
	State    string `json:"state"`
	WorkerID string `json:"workerId"`
	Trace    string `json:"trace,omitempty"` // only set if the task is errored
}

// KafkaConnectToConsoleHook is a function that lets you modify the response before it is sent to the Console frontend.
type KafkaConnectToConsoleHook = func(pluginClassName string, configs map[string]string) map[string]string

// ConnectorStatus contains information about a single connector and its tasks status
type ConnectorStatus struct {
	Name      string                      `json:"name"`
	Connector con.ConnectorState          `json:"connector"`
	Tasks     []ClusterConnectorTaskInfo  `json:"tasks"`
	Errors    []ClusterConnectorInfoError `json:"errors"`
	Type      string                      `json:"type"`
	State     connectorState              `json:"state"`
}

// aggregatedConnectorTasksStatus contains information about the Task of a connectors, this is an intermediate state
type aggregatedConnectorTasksStatus struct {
	Total      int
	Running    int
	Paused     int
	Restarting int
	Unassigned int
	Failed     int
	Tasks      []ClusterConnectorTaskInfo
	Errors     []ClusterConnectorInfoError
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
					Connectors:     s.listConnectorsExpandedToClusterConnectorInfo(connectors),
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
				Connectors:        s.listConnectorsExpandedToClusterConnectorInfo(connectors),
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
		Connectors:     s.listConnectorsExpandedToClusterConnectorInfo(connectors),
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

	connectorClass := getMapValueOrString(cInfo.Config, "connector.class", "unknown")
	return ClusterConnectorInfo{
		Name:         cInfo.Name,
		Class:        connectorClass,
		Config:       s.Interceptor.KafkaConnectToConsole(connectorClass, cInfo.Config),
		Type:         cInfo.Type,
		State:        stateInfo.Connector.State,
		Topic:        getMapValueOrString(cInfo.Config, "kafka.topic", "unknown"),
		TotalTasks:   len(stateInfo.Tasks),
		RunningTasks: runningTasks,
		Tasks:        tasks,
	}, nil
}

// GetConnectorInfo requests the connector info in the context of a single connect cluster.
func (s *Service) GetConnectorInfo(ctx context.Context, clusterName string, connector string) (con.ConnectorInfo, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return con.ConnectorInfo{}, restErr
	}

	cInfo, err := c.Client.GetConnector(ctx, connector)
	if err != nil {
		return con.ConnectorInfo{}, &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusServiceUnavailable),
			Message:      fmt.Sprintf("Failed to get connector state: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}
	connectorClass := getMapValueOrString(cInfo.Config, "connector.class", "unknown")
	return con.ConnectorInfo{
		Name:   cInfo.Name,
		Config: s.Interceptor.KafkaConnectToConsole(connectorClass, cInfo.Config),
		Tasks:  cInfo.Tasks,
		Type:   cInfo.Type,
	}, nil
}

// GetConnectorStatus requests the connector info in the context of a single connect cluster.
func (s *Service) GetConnectorStatus(ctx context.Context, clusterName string, connector string) (ConnectorStatus, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return ConnectorStatus{}, restErr
	}

	cStatus, err := c.Client.GetConnectorStatus(ctx, connector)
	if err != nil {
		return ConnectorStatus{}, &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusServiceUnavailable),
			Message:      fmt.Sprintf("Failed to get connector state: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	aggregatedTasksStatus := getAggregatedTasksStatus(cStatus.Name, cStatus.Tasks)

	holisticConnectorState := getHolisticStateFromConnector(cStatus, aggregatedTasksStatus)

	return ConnectorStatus{
		Name:      cStatus.Name,
		Connector: cStatus.Connector,
		Tasks:     aggregatedTasksStatus.Tasks,
		Errors:    append(holisticConnectorState.Errors, aggregatedTasksStatus.Errors...),
		Type:      cStatus.Type,
		State:     holisticConnectorState.State,
	}, nil
}

func (s *Service) listConnectorsExpandedToClusterConnectorInfo(l map[string]con.ListConnectorsResponseExpanded) []ClusterConnectorInfo {
	if l == nil {
		return []ClusterConnectorInfo{}
	}

	connectorInfo := make([]ClusterConnectorInfo, 0, len(l))
	for _, c := range l {
		c := c
		cInfo := connectorsResponseToClusterConnectorInfo(s.Interceptor.KafkaConnectToConsole, &c)
		connectorInfo = append(connectorInfo, *cInfo)
	}

	return connectorInfo
}

func getAggregatedTasksStatus(connectorName string, tasks []con.TaskState) aggregatedConnectorTasksStatus {
	aggregatedTasksStatus := aggregatedConnectorTasksStatus{
		Tasks:      make([]ClusterConnectorTaskInfo, len(tasks)),
		Total:      len(tasks),
		Running:    0,
		Paused:     0,
		Restarting: 0,
		Unassigned: 0,
		Failed:     0,
		Errors:     make([]ClusterConnectorInfoError, 0),
	}

	for i, task := range tasks {
		aggregatedTasksStatus.Tasks[i] = ClusterConnectorTaskInfo{
			TaskID:   task.ID,
			State:    task.State,
			WorkerID: task.WorkerID,
			Trace:    task.Trace,
		}
		switch task.State {
		case connectorStateRunning:
			aggregatedTasksStatus.Running++
		case connectorStateFailed:
			aggregatedTasksStatus.Failed++

			errTitle := fmt.Sprintf("Connector %s Task %d is in failed state.", connectorName, task.ID)
			aggregatedTasksStatus.Errors = append(aggregatedTasksStatus.Errors, ClusterConnectorInfoError{
				Type:    connectorErrorTypeError,
				Title:   errTitle,
				Content: traceToErrorContent(errTitle, task.Trace),
			})
		case connectorStatePaused:
			aggregatedTasksStatus.Paused++
		case connectorStateRestarting:
			aggregatedTasksStatus.Restarting++
		case ConnectorStatusUnassigned:
			aggregatedTasksStatus.Unassigned++
		}
	}

	return aggregatedTasksStatus
}

type holisticConnectorState struct {
	State  string
	Errors []ClusterConnectorInfoError
}

//nolint:cyclop // lots of inspection of state and tasks to determine status and errors
func getHolisticStateFromConnector(status con.ConnectorStateInfo, aggregatedTasksStatus aggregatedConnectorTasksStatus) holisticConnectorState {
	// LOGIC:
	// HEALTHY: Connector is in running state, > 0 tasks, all of them in running state.
	// UNHEALTHY: Connector is failed state.
	//			Or Connector is in running state but has 0 tasks.
	// 			Or Connector is in running state, has > 0 tasks, and all tasks are in failed state.
	// DEGRADED: Connector is in running state, has > 0 tasks, but has at least one state in failed state, but not all tasks are failed.
	// PAUSED: Connector is in paused state, regardless of individual tasks' states.
	// RESTARTING: Connector is in restarting state, or at least one task is in restarting state.
	// UNASSIGNED: Connector is in unassigned state.
	//				Or Connector is in running state, and there are unassigned tasks.
	// DESTROYED: Connector is in destroyed state, regardless of any tasks.
	// UNKNOWN: Any other scenario.
	var connStatus connectorStatus
	var errDetailedContent string
	//nolint:gocritic,goconst // this if else is easier to read as they map to rules and logic specified above.
	if (status.Connector.State == connectorStateRunning) &&
		aggregatedTasksStatus.Total > 0 && aggregatedTasksStatus.Running == aggregatedTasksStatus.Total {
		connStatus = ConnectorStatusHealthy
	} else if (status.Connector.State == connectorStateFailed) ||
		((status.Connector.State == connectorStateRunning) && (aggregatedTasksStatus.Total == 0 || aggregatedTasksStatus.Total == aggregatedTasksStatus.Failed)) {
		connStatus = ConnectorStatusUnhealthy

		if status.Connector.State == connectorStateFailed {
			errDetailedContent = "Connector " + status.Name + " is in failed state."
		} else if aggregatedTasksStatus.Total == 0 {
			errDetailedContent = "Connector " + status.Name + " is in " + strings.ToLower(status.Connector.State) + " state but has no tasks."
		} else if aggregatedTasksStatus.Total == aggregatedTasksStatus.Failed {
			errDetailedContent = "Connector " + status.Name + " is in " + strings.ToLower(status.Connector.State) + " state. All tasks are in failed state."
		}
	} else if (status.Connector.State == connectorStateRunning) && (aggregatedTasksStatus.Total > 0 && aggregatedTasksStatus.Failed > 0 && aggregatedTasksStatus.Failed < aggregatedTasksStatus.Total) {
		connStatus = ConnectorStatusDegraded
		errDetailedContent = fmt.Sprintf("Connector %s is in %s state but has %d / %d failed tasks.",
			status.Name, strings.ToLower(status.Connector.State), aggregatedTasksStatus.Failed, aggregatedTasksStatus.Total)
	} else if status.Connector.State == connectorStatePaused {
		connStatus = ConnectorStatusPaused
	} else if status.Connector.State == connectorStateStopped {
		connStatus = ConnectorStatusStopped
	} else if (status.Connector.State == connectorStateRestarting) ||
		(aggregatedTasksStatus.Total > 0 && aggregatedTasksStatus.Restarting > 0) {
		connStatus = ConnectorStatusRestarting
	} else if (status.Connector.State == connectorStateUnassigned) ||
		((status.Connector.State == connectorStateRunning) && (aggregatedTasksStatus.Total > 0 && aggregatedTasksStatus.Unassigned > 0)) {
		connStatus = ConnectorStatusUnassigned
	} else if status.Connector.State == connectorStateDestroyed {
		connStatus = ConnectorStatusDestroyed
	} else {
		connStatus = ConnectorStatusUnknown
		errDetailedContent = fmt.Sprintf("Unknown connector status. Connector %s is in %s state.",
			status.Name, strings.ToLower(status.Connector.State))
	}

	connectorErrors := make([]ClusterConnectorInfoError, 0)
	if connStatus == ConnectorStatusUnhealthy ||
		connStatus == ConnectorStatusDegraded {
		stateStr := "unhealthy"
		if connStatus == ConnectorStatusDegraded {
			stateStr = "degraded"
		}

		errTitle := "Connector " + status.Name + " is in " + stateStr + " state."

		defaultContent := errTitle
		if errDetailedContent != "" {
			defaultContent = errDetailedContent
		}

		connectorErrors = append(connectorErrors, ClusterConnectorInfoError{
			Type:    connectorErrorTypeError,
			Title:   errTitle,
			Content: traceToErrorContent(defaultContent, status.Connector.Trace),
		})
	} else if len(status.Connector.Trace) > 0 {
		errTitle := "Connector " + status.Name + " has an error"
		connectorErrors = append(connectorErrors, ClusterConnectorInfoError{
			Type:    connectorErrorTypeError,
			Title:   errTitle,
			Content: traceToErrorContent(errTitle, status.Connector.Trace),
		})
	}

	return holisticConnectorState{
		State:  connStatus,
		Errors: connectorErrors,
	}
}

func connectorsResponseToClusterConnectorInfo(configHook KafkaConnectToConsoleHook, c *con.ListConnectorsResponseExpanded) *ClusterConnectorInfo {
	// There seems to be a type missmatch for now I think it's ok to do this conversion looking for a fix in the upstream implementation
	tasks := make([]con.TaskState, len(c.Status.Tasks))

	for i, task := range c.Status.Tasks {
		tasks[i] = con.TaskState{
			ID:       task.ID,
			State:    task.State,
			WorkerID: task.WorkerID,
			Trace:    task.Trace,
		}
	}

	status := con.ConnectorStateInfo{
		Name:      c.Status.Name,
		Connector: c.Status.Connector,
		Tasks:     tasks,
		Type:      c.Status.Type,
	}

	aggregatedTasksStatus := getAggregatedTasksStatus(c.Info.Name, tasks)

	holisticState := getHolisticStateFromConnector(status, aggregatedTasksStatus)

	connectorErrors := holisticState.Errors

	connectorErrors = append(connectorErrors, aggregatedTasksStatus.Errors...)

	connectorClass := getMapValueOrString(c.Info.Config, "connector.class", "unknown")
	if configHook == nil {
		configHook = func(pluginClassName string, configs map[string]string) map[string]string {
			return configs
		}
	}
	return &ClusterConnectorInfo{
		Name:         c.Info.Name,
		Class:        connectorClass,
		Topic:        getMapValueOrString(c.Info.Config, "kafka.topic", "unknown"),
		Config:       configHook(connectorClass, c.Info.Config),
		Type:         c.Info.Type,
		State:        c.Status.Connector.State,
		WorkerID:     c.Status.Connector.WorkerID,
		Status:       holisticState.State,
		Tasks:        aggregatedTasksStatus.Tasks,
		Trace:        c.Status.Connector.Trace,
		Errors:       connectorErrors,
		TotalTasks:   len(c.Status.Tasks),
		RunningTasks: aggregatedTasksStatus.Running,
	}
}

// traceToErrorContent takes two parameters: a defaultValue string and a trace string.
// It returns a error message optimized for humans that is the sanitized trace line or the
// provided default value if no trace line is found.
func traceToErrorContent(defaultValue, trace string) string {
	if trace == "" {
		return defaultValue
	}

	lines := strings.Split(trace, "\n")
	filtered := make([]string, 0, len(lines))
	for _, l := range lines {
		l := strings.Trim(l, "\t")
		if !strings.HasSuffix(l, "exception") && !strings.HasSuffix(l, ")") {
			filtered = append(filtered, l)
		}
	}

	// some lines have 'caused by' prefix which has description
	for _, l := range filtered {
		if strings.HasPrefix(strings.ToLower(l), "caused by") {
			return sanitizeTraceLine(l)
		}
	}

	if len(filtered) > 0 {
		return sanitizeTraceLine(filtered[0])
	}

	return defaultValue
}

func sanitizeTraceLine(l string) string {
	lower := strings.ToLower(l)
	if strings.HasPrefix(lower, "caused by:") {
		l = strings.TrimPrefix(l, "caused by:")
		l = strings.TrimPrefix(l, "Caused by:")
	}

	var content string
	if strings.Index(l, ":") > 0 {
		content = l[strings.Index(l, ":")+1:]
	}

	content = strings.TrimSpace(content)

	return content
}
