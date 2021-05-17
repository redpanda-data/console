package connect

import (
	"context"
	"fmt"
	"net/url"
)

func (c *Client) ListConnectors(ctx context.Context) ([]string, error) {
	var connectorNames []string
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&connectorNames).
		SetError(ApiError{}).
		Get("/connectors")
	if err != nil {
		return nil, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return nil, err
	}

	return connectorNames, nil
}

// ListConnectorsOptions describe the available options to list connectors. Either Status or Info must be set to true.
type ListConnectorsOptions struct {
	ExpandStatus bool
	ExpandInfo   bool
}

func (l *ListConnectorsOptions) Validate() error {
	if !l.ExpandStatus && !l.ExpandInfo {
		return fmt.Errorf("either info or status must be set to true")
	}

	return nil
}

// ListConnectorsResponseExpanded is the response to /connectors if at least one expand query parameter is set.
type ListConnectorsResponseExpanded map[string]struct {
	Info   *ListConnectorsResponseExpandedInfo   `json:"info,omitempty"`
	Status *ListConnectorsResponseExpandedStatus `json:"status,omitempty"`
}

// ListConnectorsResponseExpandedInfo represents the Info object for described connectors.
type ListConnectorsResponseExpandedInfo struct {
	Name   string            `json:"name"`
	Config map[string]string `json:"config"`
	Tasks  []struct {
		Connector string `json:"connector"`
		Task      int    `json:"task"`
	} `json:"tasks"`
	Type string `json:"type"`
}

type ListConnectorsResponseExpandedStatus struct {
	Name      string `json:"name"`
	Connector struct {
		State    string `json:"state"`
		WorkerID string `json:"worker_id"`
	}
	Tasks []struct {
		ID       int    `json:"id"`
		State    string `json:"state"`
		WorkerID string `json:"worker_id"`
	} `json:"tasks"`
	Type string `json:"type"`
}

func (c *Client) ListConnectorsExpanded(ctx context.Context, opts ListConnectorsOptions) (ListConnectorsResponseExpanded, error) {
	err := opts.Validate()
	if err != nil {
		return ListConnectorsResponseExpanded{}, fmt.Errorf("list connector options are invalid: %w", err)
	}

	// Add options that we want to expand
	var expands []string
	if opts.ExpandInfo {
		expands = append(expands, "info")
	}
	if opts.ExpandStatus {
		expands = append(expands, "status")
	}

	connectors := ListConnectorsResponseExpanded{}
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&connectors).
		SetError(ApiError{}).
		SetQueryParamsFromValues(url.Values{"expand": expands}).
		Get("/connectors")
	if err != nil {
		return ListConnectorsResponseExpanded{}, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return ListConnectorsResponseExpanded{}, err
	}

	return connectors, nil
}
