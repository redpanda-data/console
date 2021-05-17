package connect

import "context"

type RootResource struct {
	Version        string `json:"version"`
	Commit         string `json:"commit"`
	KafkaClusterID string `json:"kafka_cluster_id"`
}

func (c *Client) GetRoot(ctx context.Context) (RootResource, error) {
	var root RootResource
	response, err := c.client.NewRequest().
		SetContext(ctx).
		SetResult(&root).
		SetError(ApiError{}).
		Get("/")
	if err != nil {
		return RootResource{}, err
	}

	err = getErrorFromResponse(response)
	if err != nil {
		return RootResource{}, err
	}

	return root, nil
}
