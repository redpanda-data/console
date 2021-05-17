package connect

import (
	"context"
)

func (c *Client) DeleteConnector(ctx context.Context, connectorName string) error {
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		Delete("/connectors/{connector}")
	if err != nil {
		return err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return err
	}

	return nil
}
