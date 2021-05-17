package connect

import "context"

type PutConnectorConfigOptions struct {
	Config map[string]string
}

func (c *Client) PutConnectorConfig(ctx context.Context, connectorName string, options PutConnectorConfigOptions) (ConnectorInfo, error) {
	var connectorInfo ConnectorInfo
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&connectorInfo).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		SetBody(options.Config).
		Get("/connectors/{connector}/config")
	if err != nil {
		return ConnectorInfo{}, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return ConnectorInfo{}, err
	}

	return connectorInfo, nil
}
