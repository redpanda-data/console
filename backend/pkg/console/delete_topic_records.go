// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// DeleteTopicRecords deletes records within a Kafka topic until a certain offset.
func (s *Service) DeleteTopicRecords(ctx context.Context, deleteReq kmsg.DeleteRecordsRequestTopic) (DeleteTopicRecordsResponse, *rest.Error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return DeleteTopicRecordsResponse{}, errorToRestError(err)
	}

	req := kmsg.NewDeleteRecordsRequest()
	req.Topics = []kmsg.DeleteRecordsRequestTopic{deleteReq}
	res, err := req.RequestWith(ctx, cl)
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
