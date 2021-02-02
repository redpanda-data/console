package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
	"sync"
)

func (s *Service) startMessageWorker(ctx context.Context, wg *sync.WaitGroup, isMessageOK isMessageOkFunc, jobs <-chan *kgo.Record, resultsCh chan<- *TopicMessage) {
	defer wg.Done()

	for record := range jobs {
		// Run Interpreter filter and check if message passes the filter
		deserializedRec := s.Deserializer.DeserializeRecord(record)

		headersByKey := make(map[string]interface{}, len(deserializedRec.Headers))
		headers := make([]MessageHeader, 0)
		for key, header := range deserializedRec.Headers {
			headersByKey[key] = header.Object
			headers = append(headers, MessageHeader{
				Key:   key,
				Value: header,
			})
		}

		// Check if message passes filter code
		args := interpreterArguments{
			PartitionID:  record.Partition,
			Offset:       record.Offset,
			Timestamp:    record.Timestamp,
			Key:          deserializedRec.Key.Object,
			Value:        deserializedRec.Value.Object,
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
			Key:             deserializedRec.Key,
			Value:           deserializedRec.Value,
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
