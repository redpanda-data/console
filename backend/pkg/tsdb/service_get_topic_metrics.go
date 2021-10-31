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

	topicSize, err := s.getTopicSizeTimeseries(topicName, 6*time.Hour)
	if err != nil {
		res.TopicSizeSeriesErr = err.Error()
	}
	res.TopicSizeSeries = topicSize

	messagesPerSec, err := s.getMessagesInPerSecondTimeseries(topicName, 6*time.Hour)
	if err != nil {
		res.MessageThroughputErr = err.Error()
	}
	res.MessageThroughput = messagesPerSec

	return res
}

func (s *Service) getTopicSizeTimeseries(topicName string, dur time.Duration) ([]*tstorage.DataPoint, error) {
	labels := []tstorage.Label{{Name: "topic_name", Value: topicName}}
	start := time.Now().Add(-dur).Unix()
	end := time.Now().Unix()

	return s.getDatapoints(MetricNameKafkaTopicSize, labels, start, end, 100)
}

func (s *Service) getMessagesInPerSecondTimeseries(topicName string, dur time.Duration) ([]*tstorage.DataPoint, error) {
	labels := []tstorage.Label{{Name: "topic_name", Value: topicName}}
	start := time.Now().Add(-dur).Unix()
	end := time.Now().Unix()

	dps, err := s.getDatapoints(MetricNameKafkaTopicHighWaterMarkSum, labels, start, end, -1)
	if err != nil {
		return nil, err
	}

	perSecondDps := rate(dps, 1*time.Minute)

	return scaleDown(perSecondDps, 100), nil
}
