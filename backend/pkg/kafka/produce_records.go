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
	"fmt"

	"github.com/google/uuid"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/serde"
)

const (
	// CompressionTypeNone means no compression.
	CompressionTypeNone   = iota
	CompressionTypeGzip   // CompressionTypeGzip represents Gzip compression.
	CompressionTypeSnappy // CompressionTypeSnappy represents Snappy compression.
	CompressionTypeLz4    // CompressionTypeLz4 represents LZ4 compression.
	CompressionTypeZstd   // CompressionTypeZstd represents ZSTD compression.
)

// ProduceRecordResponse is the response after sending the produce request to Kafka.
type ProduceRecordResponse struct {
	TopicName   string
	PartitionID int32
	Offset      int64
	Error       error

	KeyTroubleshooting   []serde.TroubleshootingReport
	ValueTroubleshooting []serde.TroubleshootingReport
}

// ProduceRecords produces all given records (transactional). If transactions are disabled and one or more records
// failed to be produced it will be reported separately for each record as part of ProduceRecordResponse.
func (s *Service) ProduceRecords(
	ctx context.Context,
	records []*kgo.Record,
	useTransactions bool,
	compressionType int8,
) ([]ProduceRecordResponse, error) {
	additionalKgoOpts := []kgo.Opt{
		kgo.ProducerBatchCompression(compressionTypeToKgoCodec(compressionType)...),

		// Use custom partitioner that treats
		// - PartitionID = -1 just like the kgo.StickyKeyPartitioner() would do (round robin batch-wise)
		// - PartitionID >= 0 Use the partitionID as specified in the record struct
		kgo.RecordPartitioner(kgo.BasicConsistentPartitioner(func(topic string) func(*kgo.Record, int) int {
			s := kgo.StickyKeyPartitioner(nil).ForTopic(topic)
			return func(r *kgo.Record, n int) int {
				if r.Partition == -1 {
					return s.Partition(r, n)
				}
				return int(r.Partition)
			}
		})),
	}
	if useTransactions {
		additionalKgoOpts = append(additionalKgoOpts, kgo.TransactionalID(uuid.New().String()))
	}

	client, err := s.NewKgoClient(additionalKgoOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create new kafka client: %w", err)
	}
	defer client.Close()

	if useTransactions {
		// In case of transactions we do not want to risk a context cancellation, as this would not allow us
		// to guarantee exactly once semantics!
		ctx = context.Background()

		err := client.BeginTransaction()
		if err != nil {
			return nil, fmt.Errorf("unable to begin transaction: %w", err)
		}
	}

	recordResponses := make([]ProduceRecordResponse, 0)
	for _, r := range records {
		client.Produce(ctx, r, func(producedRecord *kgo.Record, err error) {
			recordResponses = append(recordResponses, ProduceRecordResponse{
				TopicName:   producedRecord.Topic,
				PartitionID: producedRecord.Partition,
				Offset:      producedRecord.Offset,
				Error:       err,
			})
		})
	}

	// client.Flush() will block until all produce() functions have returned
	err = client.Flush(ctx)
	if err != nil {
		return nil, fmt.Errorf("flushing records: %w", err)
	}

	if useTransactions {
		err := client.EndTransaction(ctx, true)
		if err != nil {
			return nil, fmt.Errorf("unable to end transaction: %w", err)
		}
	}

	return recordResponses, nil
}

// PublishRecord serializes and produces the records.
func (s *Service) PublishRecord(ctx context.Context,
	topic string,
	partitionID int32,
	headers []kgo.RecordHeader,
	key *serde.RecordPayloadInput,
	value *serde.RecordPayloadInput,
	useTransactions bool,
	compressionType int8,
) (*ProduceRecordResponse, error) {
	data, err := s.SerdeService.SerializeRecord(ctx, serde.SerializeInput{
		Topic: topic,
		Key:   *key,
		Value: *value,
	})
	if err != nil {
		return &ProduceRecordResponse{
			Error:                err,
			KeyTroubleshooting:   data.Key.Troubleshooting,
			ValueTroubleshooting: data.Value.Troubleshooting,
		}, err
	}

	record := &kgo.Record{
		Topic:     topic,
		Key:       data.Key.Payload,
		Value:     data.Value.Payload,
		Headers:   headers,
		Partition: partitionID,
	}

	r, err := s.ProduceRecords(ctx, []*kgo.Record{record}, useTransactions, compressionType)
	if err != nil {
		if len(r) > 0 {
			return &r[0], err
		}

		return &ProduceRecordResponse{Error: err}, err
	}

	return &r[0], nil
}

// compressionTypeToKgoCodec receives the compressionType as an int8 enum and returns a slice of compression
// codecs which contains the compression codecs in preference order. It will always return the specified
// compressionType as highest preference and add "None" as fallback codec.
func compressionTypeToKgoCodec(compressionType int8) []kgo.CompressionCodec {
	switch compressionType {
	case CompressionTypeNone:
		return []kgo.CompressionCodec{kgo.NoCompression()}
	case CompressionTypeGzip:
		return []kgo.CompressionCodec{kgo.GzipCompression(), kgo.NoCompression()}
	case CompressionTypeSnappy:
		return []kgo.CompressionCodec{kgo.SnappyCompression(), kgo.NoCompression()}
	case CompressionTypeLz4:
		return []kgo.CompressionCodec{kgo.Lz4Compression(), kgo.NoCompression()}
	case CompressionTypeZstd:
		return []kgo.CompressionCodec{kgo.ZstdCompression(), kgo.NoCompression()}
	default:
		return []kgo.CompressionCodec{kgo.NoCompression()}
	}
}
