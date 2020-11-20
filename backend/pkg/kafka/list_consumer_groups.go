package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type ListConsumerGroupsResponseSharded struct {
	Groups         []ListConsumerGroupsResponse
	RequestsSent   int
	RequestsFailed int
}

func (l *ListConsumerGroupsResponseSharded) GetGroupIDs() []string {
	groupIDs := make([]string, 0)
	for _, groupResp := range l.Groups {
		if groupResp.Error != nil || groupResp.Groups == nil {
			continue
		}
		for _, group := range groupResp.Groups.Groups {
			groupIDs = append(groupIDs, group.Group)
		}
	}
	return groupIDs
}

// LogDirResponse can have an error (if the broker failed to return data) or the actual LogDir response
type ListConsumerGroupsResponse struct {
	BrokerMetadata kgo.BrokerMetadata
	Groups         *kmsg.ListGroupsResponse
	Error          error
}

// ListConsumerGroups returns an array of Consumer group ids. Failed broker requests will be returned in the response.
// If all broker requests fail an error will be returned.
func (s *Service) ListConsumerGroups(ctx context.Context) (*ListConsumerGroupsResponseSharded, error) {
	req := kmsg.ListGroupsRequest{}
	shardedResp := s.KafkaClient.RequestSharded(ctx, &req)

	result := &ListConsumerGroupsResponseSharded{
		Groups:         make([]ListConsumerGroupsResponse, len(shardedResp)),
		RequestsSent:   0,
		RequestsFailed: 0,
	}
	var lastErr error
	for _, kresp := range shardedResp {
		result.RequestsSent++
		if kresp.Err != nil {
			result.RequestsFailed++
			lastErr = kresp.Err
		}
		res := kresp.Resp.(*kmsg.ListGroupsResponse)

		result.Groups = append(result.Groups, ListConsumerGroupsResponse{
			BrokerMetadata: kresp.Meta,
			Groups:         res,
			Error:          kresp.Err,
		})
	}

	if result.RequestsSent > 0 && result.RequestsSent == result.RequestsFailed {
		return result, fmt.Errorf("all '%v' requests have failed, last error: %w", len(shardedResp), lastErr)
	}

	return result, nil
}
