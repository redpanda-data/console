package connect

import (
	"context"
	"fmt"
)

type CreateConnectorRequest struct {
	Name   string            `json:"name"`
	Config map[string]string `json:"config"`
}

func (c *CreateConnectorRequest) Validate() error {
	if c.Name == "" {
		return fmt.Errorf("connector name must be set")
	}
	if len(c.Config) == 0 {
		return fmt.Errorf("connector config must be set")
	}

	return nil
}

func (c *Client) CreateConnector(ctx context.Context, req CreateConnectorRequest) (ConnectorInfo, error) {
	if err := req.Validate(); err != nil {
		return ConnectorInfo{}, fmt.Errorf("create connector options are invalid: %w", err)
	}

	var createResponse ConnectorInfo
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&createResponse).
		SetError(ApiError{}).
		SetBody(req).
		Post("/connectors")
	if err != nil {
		return ConnectorInfo{}, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return ConnectorInfo{}, err
	}

	return createResponse, nil
}
