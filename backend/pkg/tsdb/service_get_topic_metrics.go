package tsdb

import (
	"context"
	"github.com/nakabonne/tstorage"
	"time"
)

type TopicMetrics struct {
	TopicSizeSeries    []*tstorage.DataPoint `json:"topicSizeSeries"`
	TopicSizeSeriesErr string                `json:"topicSizeSeriesError,omitempty"`

	MessageThroughput    []*tstorage.DataPoint `json:"messagesInPerSecond"`
	MessageThroughputErr string                `json:"messagesInPerSecondError,omitempty"`
}

func (s *Service) GetTopicMetrics(_ context.Context, topicName string) TopicMetrics {
	res := TopicMetrics{}

	topicSize, err := s.GetTopicSizeTimeseries(topicName, 6*time.Hour)
	if err != nil {
		res.TopicSizeSeriesErr = err.Error()
	}
	res.TopicSizeSeries = topicSize

	messagesPerSec, err := s.GetMessagesInPerSecondTimeseries(topicName, 6*time.Hour)
	if err != nil {
		res.MessageThroughputErr = err.Error()
	}
	res.MessageThroughput = messagesPerSec

	return res
}
