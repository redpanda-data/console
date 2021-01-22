package kafka

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/proto"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

func (s *Service) startMessageWorker(ctx context.Context, isMessageOK isMessageOkFunc, jobs <-chan *kgo.Record, resultsCh chan<- *TopicMessage) {
	for record := range jobs {
		// Run Interpreter filter and check if message passes the filter
		value := s.Deserializer.DeserializePayload(record.Value, record.Topic, proto.RecordValue)
		key := s.Deserializer.DeserializePayload(record.Key, record.Topic, proto.RecordKey)
		headers := s.DeserializeHeaders(record.Headers)

		headersByKey := make(map[string]interface{}, len(headers))
		for _, header := range headers {
			headersByKey[header.Key] = header.Value.Object
		}

		// Check if message passes filter code
		args := interpreterArguments{
			PartitionID:  record.Partition,
			Offset:       record.Offset,
			Timestamp:    record.Timestamp,
			Key:          key.Object,
			Value:        value.Object,
			HeadersByKey: headersByKey,
		}

		isOK, err := isMessageOK(args)
		var errMessage string
		if err != nil {
			s.Logger.Debug("failed to check if message is ok", zap.Error(err))
			errMessage = fmt.Sprintf("Failed to check if message is ok (partition: '%v', offset: '%v'). Error: %v", record.Partition, record.Offset, err)
		}

		topicMessage := &TopicMessage{
			PartitionID:     record.Partition,
			Offset:          record.Offset,
			Timestamp:       record.Timestamp.Unix(),
			Headers:         headers,
			Compression:     compressionTypeDisplayname(record.Attrs.CompressionType()),
			IsTransactional: record.Attrs.IsTransactional(),
			Key:             key,
			Value:           value,
			IsValueNull:     record.Value == nil,
			IsMessageOk:     isOK,
			ErrorMessage:    errMessage,
			MessageSize:     int64(len(record.Key) + len(record.Value)),
		}

		select {
		case <-ctx.Done():
			return
		case resultsCh <- topicMessage:
		}
	}
}
