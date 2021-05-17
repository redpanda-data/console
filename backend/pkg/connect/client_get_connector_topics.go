package connect

import "context"

type ConnectorTopics struct {
	Topics []string `json:"topics"`
}

func (c *Client) GetConnectorTopics(ctx context.Context, connectorName string) (map[string]ConnectorTopics, error) {
	var topicsByConnector map[string]ConnectorTopics
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&topicsByConnector).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		Get("/connectors/{connector}/topics")
	if err != nil {
		return nil, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return nil, err
	}

	return topicsByConnector, nil
}
