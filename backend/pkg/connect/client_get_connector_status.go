package connect

import "context"

type ConnectorStateInfo struct {
	Name      string         `json:"name"`
	Connector ConnectorState `json:"connector"`
	Tasks     []TaskState    `json:"tasks"`
	Type      string         `json:"type"`
}

type ConnectorState struct {
	State    string `json:"state"`
	WorkerID string `json:"worker_id"`
}

type TaskState struct {
	ID       int    `json:"id"`
	State    string `json:"state"`
	WorkerID string `json:"worker_id"`
}

func (c *Client) GetConnectorStatus(ctx context.Context, connectorName string) (ConnectorStateInfo, error) {
	var stateInfo ConnectorStateInfo
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&stateInfo).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		Get("/connectors/{connector}/status")
	if err != nil {
		return ConnectorStateInfo{}, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return ConnectorStateInfo{}, err
	}

	return stateInfo, nil
}
