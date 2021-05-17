package connect

import (
	"context"
	"strconv"
)

func (c *Client) RestartConnectorTask(ctx context.Context, connectorName string, taskID int) error {
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetError(ApiError{}).
		SetPathParam("connector", connectorName).
		SetPathParam("taskID", strconv.Itoa(taskID)).
		Post("/connectors/{connector}/tasks/{taskID}/restart")
	if err != nil {
		return err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return err
	}

	return nil
}
