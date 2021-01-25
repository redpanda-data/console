package kafka

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"net/http"
)

// GetMetadata returns some generic information about the brokers in the given cluster
func (s *Service) GetMetadata(ctx context.Context, topics []string) (*kmsg.MetadataResponse, error) {
	metadataRequestTopics := make([]kmsg.MetadataRequestTopic, len(topics))
	for i, topic := range topics {
		topicReq := kmsg.NewMetadataRequestTopic()
		t := topic
		topicReq.Topic = &t
		metadataRequestTopics[i] = topicReq
	}

	// Set metadata request topics to nil so that all topics will be requested
	if len(metadataRequestTopics) == 0 {
		metadataRequestTopics = nil
	}

	req := kmsg.NewMetadataRequest()
	req.Topics = metadataRequestTopics

	return req.RequestWith(ctx, s.KafkaClient)
}

func (s *Service) GetSingleMetadata(ctx context.Context, topic string) (kmsg.MetadataResponseTopic, *rest.Error) {
	metadata, err := s.GetMetadata(ctx, []string{topic})
	if err != nil {
		return kmsg.MetadataResponseTopic{}, &rest.Error{
			Err:     err,
			Status:  http.StatusInternalServerError,
			Message: fmt.Sprintf("Failed to request metadata for topic '%v': %v", topic, err.Error()),
		}
	}
	if len(metadata.Topics) != 1 {
		customErr := fmt.Errorf("expected just one topic metadata result, but got '%v'", len(metadata.Topics))
		return kmsg.MetadataResponseTopic{}, &rest.Error{
			Err:     customErr,
			Status:  http.StatusInternalServerError,
			Message: fmt.Sprintf("Failed to request metadata for topic '%v': %v", topic, customErr.Error()),
		}
	}

	topicMetadata := metadata.Topics[0]
	err = kerr.ErrorForCode(topicMetadata.ErrorCode)
	if err != nil {
		// If topic does not exist return a 404 error
		if topicMetadata.ErrorCode == kerr.UnknownTopicOrPartition.Code {
			return kmsg.MetadataResponseTopic{}, &rest.Error{
				Err:     err,
				Status:  http.StatusNotFound,
				Message: fmt.Sprintf("Failed to get metadata because the requested topic '%v' does not exist.", topic),
			}
		}

		return kmsg.MetadataResponseTopic{}, &rest.Error{
			Err:     err,
			Status:  http.StatusInternalServerError,
			Message: fmt.Sprintf("Failed to get metadata for topic '%v': %v", topic, err.Error()),
		}
	}

	return topicMetadata, nil
}
