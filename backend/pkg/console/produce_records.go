// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/google/uuid"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/serde"
)

// ProduceRecord serializes and produces a single Kafka Record.
func (s *Service) ProduceRecord(
	ctx context.Context,
	topic string,
	partitionID int32,
	headers []kgo.RecordHeader,
	key *serde.RecordPayloadInput,
	value *serde.RecordPayloadInput,
	useTransactions bool,
	compressionOpts []kgo.CompressionCodec,
) (*ProduceRecordResponse, error) {
	data, err := s.serdeSvc.SerializeRecord(ctx, serde.SerializeInput{
		Topic: topic,
		Key:   *key,
		Value: *value,
	})
	if err != nil {
		return &ProduceRecordResponse{
			Error:                err.Error(),
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

	producedRecordsResponse := s.ProducePlainRecords(ctx, []*kgo.Record{record}, useTransactions, compressionOpts)
	if producedRecordsResponse.Error != "" {
		return nil, errors.New(producedRecordsResponse.Error)
	}

	if len(producedRecordsResponse.Records) != 1 {
		return nil, fmt.Errorf("expected 1 record, got %d, this is a bug", len(producedRecordsResponse.Records))
	}

	return &producedRecordsResponse.Records[0], nil
}

// ProduceRecordResponse is the response to producing a Kafka RecordBatch.
type ProduceRecordResponse struct {
	TopicName            string                        `json:"topicName"`
	PartitionID          int32                         `json:"partitionId"`
	Offset               int64                         `json:"offset"`
	Error                string                        `json:"error,omitempty"`
	KeyTroubleshooting   []serde.TroubleshootingReport `json:"keyTroubleshooting,omitempty"`
	ValueTroubleshooting []serde.TroubleshootingReport `json:"valueTroubleshooting,omitempty"`
}

// ProduceRecordsResponse is the responses to producing multiple Kafka RecordBatches.
type ProduceRecordsResponse struct {
	Records []ProduceRecordResponse `json:"records"`

	// Error indicates that producing for all records have failed. E.g. because creating a transaction has failed
	// when transactions were enabled. Another option could be that the Kafka client creation has failed because
	// brokers are temporarily offline.
	Error string `json:"error,omitempty"`
}

// ProducePlainRecords produces one or more plain kgo.Record. This might involve
// multiple topics or a just a single topic. If multiple records shall be
// produced the user can opt in for using transactions so that either none or
// all records will be produced successfully.
func (s *Service) ProducePlainRecords(ctx context.Context, records []*kgo.Record, useTransactions bool, compressionOpts []kgo.CompressionCodec) ProduceRecordsResponse {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return ProduceRecordsResponse{
			Error: err.Error(),
		}
	}

	additionalKgoOpts := []kgo.Opt{
		kgo.ProducerBatchCompression(compressionOpts...),

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

	opts := slices.Concat(cl.Opts(), additionalKgoOpts)
	client, err := kgo.NewClient(opts...)
	if err != nil {
		return ProduceRecordsResponse{
			Error: fmt.Errorf("failed to create new kafka client: %w", err).Error(),
		}
	}
	defer client.Close()

	if useTransactions {
		// In case of transactions we do not want to risk a context cancellation, as this would not allow us
		// to guarantee exactly once semantics!
		ctx = context.Background()

		err := client.BeginTransaction()
		if err != nil {
			return ProduceRecordsResponse{
				Error: fmt.Errorf("unable to begin transaction: %w", err).Error(),
			}
		}
	}

	recordResponses := make([]ProduceRecordResponse, 0)
	for _, r := range records {
		client.Produce(ctx, r, func(producedRecord *kgo.Record, err error) {
			recordResponses = append(recordResponses, ProduceRecordResponse{
				TopicName:   producedRecord.Topic,
				PartitionID: producedRecord.Partition,
				Offset:      producedRecord.Offset,
				Error:       errorToString(err),
			})
		})
	}

	// client.Flush() will block until all produce() functions have returned
	err = client.Flush(ctx)
	if err != nil {
		return ProduceRecordsResponse{
			Records: nil,
			Error:   fmt.Errorf("failed flushing records: %w", err).Error(),
		}
	}

	if useTransactions {
		err := client.EndTransaction(ctx, true)
		if err != nil {
			return ProduceRecordsResponse{
				Records: nil,
				Error:   fmt.Errorf("failed to end transactions: %w", err).Error(),
			}
		}
	}

	return ProduceRecordsResponse{
		Records: recordResponses,
	}
}
