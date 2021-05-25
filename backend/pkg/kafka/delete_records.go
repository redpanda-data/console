package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) DeleteRecords(ctx context.Context, deleteReq kmsg.DeleteRecordsRequestTopic) (*kmsg.DeleteRecordsResponse, error) {
	req := kmsg.NewDeleteRecordsRequest()
	req.Topics = []kmsg.DeleteRecordsRequestTopic{deleteReq}

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to delete records: %w", err)
	}

	return res, nil
}
