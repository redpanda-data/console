// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// LogDirResponseSharded is a helper type that carries the sum of all log dir response shards.
type LogDirResponseSharded struct {
	LogDirResponses []LogDirResponse
	RequestsSent    int
	RequestsFailed  int
}

// LogDirResponse can have an error (if the broker failed to return data) or the actual LogDir response
type LogDirResponse struct {
	BrokerMetadata kgo.BrokerMetadata
	LogDirs        kmsg.DescribeLogDirsResponse
	Error          error
}

// DescribeLogDirs requests directory information for topic partitions. This request was added in KIP-113 and is
// included in Kafka 1.1.0+ releases.
//
// Use nil for topicPartitions to describe all topics and partitions.
func (s *Service) DescribeLogDirs(ctx context.Context, topicPartitions []kmsg.DescribeLogDirsRequestTopic) []LogDirResponse {
	req := kmsg.NewDescribeLogDirsRequest()
	req.Topics = topicPartitions
	shardedResp := s.KafkaClient.RequestSharded(ctx, &req)

	result := make([]LogDirResponse, len(shardedResp))
	for i, kresp := range shardedResp {
		res, ok := kresp.Resp.(*kmsg.DescribeLogDirsResponse)
		if !ok {
			res = &kmsg.DescribeLogDirsResponse{}
		}
		result[i] = LogDirResponse{
			BrokerMetadata: kresp.Meta,
			LogDirs:        *res,
			Error:          kresp.Err,
		}
	}

	return result
}
