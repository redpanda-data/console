package connect

import "context"

func (c *Client) GetConnectorConfig(ctx context.Context, connectorName string) (map[string]string, error) {
	var connectorConfig map[string]string
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&connectorConfig).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		Get("/connectors/{connector}/config")
	if err != nil {
		return nil, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return nil, err
	}

	return connectorConfig, nil
}
