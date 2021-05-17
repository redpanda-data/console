package connect

import (
	"context"
)

func (c *Client) PauseConnector(ctx context.Context, connectorName string) error {
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		Put("/connectors/{connector}/pause")
	if err != nil {
		return err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return err
	}

	return nil
}
