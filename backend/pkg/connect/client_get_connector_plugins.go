package connect

import "context"

type ConnectorPluginInfo struct {
	Class   string `json:"class"`
	Type    string `json:"type,omitempty"`
	Version string `json:"version,omitempty"`
}

func (c *Client) GetConnectorPlugins(ctx context.Context) ([]ConnectorPluginInfo, error) {
	var connectorPlugins []ConnectorPluginInfo
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&connectorPlugins).
		SetError(ApiError{}).
		Get("/connector-plugins")
	if err != nil {
		return nil, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return nil, err
	}

	return connectorPlugins, nil
}
