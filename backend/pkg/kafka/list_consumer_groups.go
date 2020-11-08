package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type ListConsumerGroupsResponse struct {
	Groups []kmsg.ListGroupsResponseGroup
	Errors []error
}

// ListConsumerGroups returns an array of Consumer group ids. Failed broker requests will be returned in the response.
// If all broker requests fail an error will be returned.
func (s *Service) ListConsumerGroups(ctx context.Context) (*ListConsumerGroupsResponse, error) {
	req := kmsg.ListGroupsRequest{}

	// TODO: Use sharded request so that we can return all errors
	errors := make([]error, 0)
	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to list consumer groups: %w", err)
	}

	err = kerr.ErrorForCode(res.ErrorCode)
	if err != nil {
		errDescriptive := fmt.Errorf("list consumer group inner error: %w", err)
		errors = append(errors, errDescriptive)
	}

	return &ListConsumerGroupsResponse{
		Groups: res.Groups,
		Errors: errors,
	}, nil
}
