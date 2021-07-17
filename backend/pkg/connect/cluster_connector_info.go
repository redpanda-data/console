package connect

import "github.com/cloudhut/connect-client"

type ClusterConnectorInfo struct {
	Name         string                     `json:"name"`
	Class        string                     `json:"class"`
	Type         string                     `json:"type"`  // Source or Sink
	Topic        string                     `json:"topic"` // Kafka Topic name
	State        string                     `json:"state"` // Running, ..
	TotalTasks   int                        `json:"totalTasks"`
	RunningTasks int                        `json:"runningTasks"`
	Tasks        []ClusterConnectorTaskInfo `json:"tasks"`
}

type ClusterConnectorTaskInfo struct {
	TaskID   int    `json:"taskId"`
	State    string `json:"state"`
	WorkerID string `json:"workerId"`
}

func listConnectorsExpandedToClusterConnectorInfo(l map[string]connect.ListConnectorsResponseExpanded) []ClusterConnectorInfo {
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
			}
			if task.State == "RUNNING" {
				runningTasks++
			}
		}

		connectorInfo = append(connectorInfo, ClusterConnectorInfo{
			Name:         c.Info.Name,
			Class:        getMapValueOrString(c.Info.Config, "connector.class", "unknown"),
			Topic:        getMapValueOrString(c.Info.Config, "kafka.topic", "unknown"),
			Type:         c.Info.Type,
			State:        c.Status.Connector.State,
			Tasks:        tasks,
			TotalTasks:   len(c.Status.Tasks),
			RunningTasks: runningTasks,
		})
	}

	return connectorInfo
}
