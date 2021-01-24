package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

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

// DescribeLogeDirs requests directory information for topic partitions. This request was added in KIP-113 and is
// included in Kafka 1.1.0+ releases.
//
// Use nil for topicPartitions to describe all topics and partitions.
func (s *Service) DescribeLogDirs(ctx context.Context, topicPartitions []kmsg.DescribeLogDirsRequestTopic) (LogDirResponseSharded, error) {
	req := kmsg.NewDescribeLogDirsRequest()
	req.Topics = topicPartitions
	shardedResp := s.KafkaClient.RequestSharded(ctx, &req)

	result := LogDirResponseSharded{
		LogDirResponses: make([]LogDirResponse, 0, len(shardedResp)),
		RequestsSent:    0,
		RequestsFailed:  0,
	}
	var lastErr error
	for _, kresp := range shardedResp {
		result.RequestsSent++
		if kresp.Err != nil {
			result.RequestsFailed++
			lastErr = kresp.Err
		}

		res, ok := kresp.Resp.(*kmsg.DescribeLogDirsResponse)
		if !ok {
			res = &kmsg.DescribeLogDirsResponse{}
		}
		result.LogDirResponses = append(result.LogDirResponses, LogDirResponse{
			BrokerMetadata: kresp.Meta,
			LogDirs:        *res,
			Error:          kresp.Err,
		})
	}

	if result.RequestsSent > 0 && result.RequestsSent == result.RequestsFailed {
		return result, fmt.Errorf("all '%v' requests have failed, last error: %w", len(shardedResp), lastErr)
	}

	return result, nil
}
