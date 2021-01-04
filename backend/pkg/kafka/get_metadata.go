package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// GetMetadata returns some generic information about the brokers in the given cluster
func (s *Service) GetMetadata(ctx context.Context, topics []string) (*kmsg.MetadataResponse, error) {
	metadataRequestTopics := make([]kmsg.MetadataRequestTopic, len(topics))
	for i, topic := range topics {
		metadataRequestTopics[i] = kmsg.MetadataRequestTopic{Topic: &topic}
	}

	// Set metadata request topics to nil so that all topics will be requested
	if len(metadataRequestTopics) == 0 {
		metadataRequestTopics = nil
	}

	req := kmsg.MetadataRequest{
		Topics: metadataRequestTopics,
	}

	return req.RequestWith(ctx, s.KafkaClient)
}

func (s *Service) GetSingleMetadata(ctx context.Context, topic string) (kmsg.MetadataResponseTopic, error) {
	metadata, err := s.GetMetadata(ctx, []string{topic})
	if err != nil {
		return kmsg.MetadataResponseTopic{}, fmt.Errorf("failed to get metadata: %w", err)
	}
	if len(metadata.Topics) != 1 {
		return kmsg.MetadataResponseTopic{}, fmt.Errorf("expected just one topic metadata result, but got '%v'", len(metadata.Topics))
	}

	topicMetadata := metadata.Topics[0]
	err = kerr.ErrorForCode(topicMetadata.ErrorCode)
	if err != nil {
		return kmsg.MetadataResponseTopic{}, fmt.Errorf("failed to get partitions: %w", err)
	}

	return topicMetadata, nil
}
