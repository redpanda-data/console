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
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/serde"
)

// ProduceRecordsResponse is the responses to producing multiple Kafka RecordBatches.
type ProduceRecordsResponse struct {
	Records []ProduceRecordResponse `json:"records"`

	// Error indicates that producing for all records have failed. E.g. because creating a transaction has failed
	// when transactions were enabled. Another option could be that the Kafka client creation has failed because
	// brokers are temporarily offline.
	Error string `json:"error,omitempty"`
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

// ProduceRecords produces one or more records. This might involve multiple topics or a just a single topic.
// If multiple records shall be produced the user can opt in for using transactions so that either none or all
// records will be produced successfully.
func (s *Service) ProduceRecords(ctx context.Context, records []*kgo.Record, useTransactions bool, compressionOpts []kgo.CompressionCodec) ProduceRecordsResponse {
	recordResponses, err := s.kafkaSvc.ProduceRecords(ctx, records, useTransactions, compressionOpts)
	if err != nil {
		return ProduceRecordsResponse{
			Records: nil,
			Error:   fmt.Sprintf("Failed to produce records: %v", err.Error()),
		}
	}

	formattedResponses := make([]ProduceRecordResponse, len(recordResponses))
	for i, record := range recordResponses {
		var errorStr string
		if record.Error != nil {
			errorStr = record.Error.Error()
		}
		formattedResponses[i] = ProduceRecordResponse{
			TopicName:   record.TopicName,
			PartitionID: record.PartitionID,
			Offset:      record.Offset,
			Error:       errorStr,
		}
	}

	return ProduceRecordsResponse{
		Records: formattedResponses,
		Error:   "", // Will be omitted
	}
}

// PublishRecord serializes and produces the records.
func (s *Service) PublishRecord(
	ctx context.Context,
	topic string,
	partitionID int32,
	headers []kgo.RecordHeader,
	key *serde.RecordPayloadInput,
	value *serde.RecordPayloadInput,
	useTransactions bool,
	compressionOpts []kgo.CompressionCodec,
) (*ProduceRecordResponse, error) {
	r, err := s.kafkaSvc.PublishRecord(ctx, topic, partitionID, headers, key, value, useTransactions, compressionOpts)
	res := &ProduceRecordResponse{}

	if r != nil {
		res.TopicName = r.TopicName
		res.PartitionID = r.PartitionID
		res.Offset = r.Offset
		res.KeyTroubleshooting = r.KeyTroubleshooting
		res.ValueTroubleshooting = r.ValueTroubleshooting

		if r.Error != nil {
			res.Error = r.Error.Error()
		}
	}

	if err != nil {
		res.Error = err.Error()
	}

	return res, err
}
