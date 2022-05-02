// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"net/http"
)

// DeleteTopic deletes a Kafka Topic (if possible and not disabled).
func (s *Service) DeleteTopic(ctx context.Context, topicName string) *rest.Error {
	res, err := s.kafkaSvc.DeleteTopics(ctx, []string{topicName})
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to execute delete topic command: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("topic_name", topicName)},
			IsSilent:     false,
		}
	}

	if len(res.Topics) != 1 {
		return &rest.Error{
			Err:          fmt.Errorf("topics array in response is empty"),
			Status:       http.StatusServiceUnavailable,
			Message:      "Unexpected Kafka response: No topics set in the response",
			InternalLogs: []zapcore.Field{zap.String("topic_name", topicName)},
			IsSilent:     false,
		}
	}

	topicRes := res.Topics[0]
	err = kerr.ErrorForCode(topicRes.ErrorCode)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to delete Kafka topic: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("topic_name", topicName)},
			IsSilent:     false,
		}
	}

	return nil
}

type DeleteTopicRecordsResponse struct {
	TopicName  string                                `json:"topicName"`
	Partitions []DeleteTopicRecordsResponsePartition `json:"partitions"`
}

type DeleteTopicRecordsResponsePartition struct {
	PartitionID  int32  `json:"partitionId"`
	LowWaterMark int64  `json:"lowWaterMark"`
	ErrorMsg     string `json:"error,omitempty"`
}

// DeleteTopicRecords deletes records within a Kafka topic until a certain offset.
func (s *Service) DeleteTopicRecords(ctx context.Context, deleteReq kmsg.DeleteRecordsRequestTopic) (DeleteTopicRecordsResponse, *rest.Error) {
	res, err := s.kafkaSvc.DeleteRecords(ctx, deleteReq)
	if err != nil {
		return DeleteTopicRecordsResponse{}, &rest.Error{
			Err:      err,
			Status:   http.StatusServiceUnavailable,
			Message:  fmt.Sprintf("Failed to execute delete topic command: %v", err.Error()),
			IsSilent: false,
		}
	}

	if len(res.Topics) != 1 {
		return DeleteTopicRecordsResponse{}, &rest.Error{
			Err:      fmt.Errorf("topics array in response is empty"),
			Status:   http.StatusServiceUnavailable,
			Message:  "Unexpected Kafka response: No topics set in the response",
			IsSilent: false,
		}
	}

	topicRes := res.Topics[0]
	partitions := make([]DeleteTopicRecordsResponsePartition, len(topicRes.Partitions))
	for i, partitionRes := range topicRes.Partitions {
		err = kerr.ErrorForCode(partitionRes.ErrorCode)
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		partitions[i] = DeleteTopicRecordsResponsePartition{
			PartitionID:  partitionRes.Partition,
			LowWaterMark: partitionRes.LowWatermark,
			ErrorMsg:     errMsg,
		}
	}

	return DeleteTopicRecordsResponse{
		TopicName:  topicRes.Topic,
		Partitions: partitions,
	}, nil
}
