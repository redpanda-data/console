package connect

import "context"

type ConnectorInfo struct {
	Name   string            `json:"name"`
	Config map[string]string `json:"config"`
	Tasks  []ConnectorTaskID `json:"tasks"`
	Type   string            `json:"type,omitempty"`
}

type ConnectorTaskID struct {
	Connector string `json:"connector"`
	Task      int    `json:"task"`
}

func (c *Client) GetConnector(ctx context.Context, connectorName string) (ConnectorInfo, error) {
	var connectorInfo ConnectorInfo
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&connectorInfo).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		Get("/connectors/{connector}")
	if err != nil {
		return ConnectorInfo{}, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return ConnectorInfo{}, err
	}

	return connectorInfo, nil
}
