package tsdb

import (
	"context"
	"github.com/nakabonne/tstorage"
	"time"
)

type SingleConsumerGroupMetrics struct {
	TopicLags    []*tstorage.DataPoint `json:"topicLags"`
	TopicLagsErr string                `json:"topicLagsError"`
}

func (s *Service) GetConsumerGroupMetrics(_ context.Context, groupID string) SingleConsumerGroupMetrics {
	res := SingleConsumerGroupMetrics{}

	topicLags, err := s.getConsumerGroupTopicLags(groupID, 6*time.Hour)
	if err != nil {
		res.TopicLagsErr = err.Error()
	}
	res.TopicLags = topicLags

	return res
}

func (s *Service) getConsumerGroupTopicLags(groupName string, dur time.Duration) ([]*tstorage.DataPoint, error) {
	labels := []tstorage.Label{{Name: "consumer_group", Value: groupName}}
	start := time.Now().Add(-dur).Unix()
	end := time.Now().Unix()

	return s.getDatapoints(MetricNameKafkaConsumerGroupSummedTopicLag, labels, start, end, 100)
}
