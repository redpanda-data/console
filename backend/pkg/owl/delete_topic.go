package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
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
