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
)

type ProduceRecordsResponse struct {
	Records []ProduceRecordResponse `json:"records"`

	// Error indicates that producing for all records have failed. E.g. because creating a transaction has failed
	// when transactions were enabled. Another option could be that the Kafka client creation has failed because
	// brokers are temporarily offline.
	Error string `json:"error,omitempty"`
}

type ProduceRecordResponse struct {
	TopicName   string `json:"topicName"`
	PartitionID int32  `json:"partitionId"`
	Offset      int64  `json:"offset"`
	Error       string `json:"error,omitempty"`
}

// ProduceRecords produces one or more records. This might involve multiple topics or a just a single topic.
// If multiple records shall be produced the user can opt in for using transactions so that either none or all
// records will be produced successfully.
func (s *Service) ProduceRecords(ctx context.Context, records []*kgo.Record, useTransactions bool, compressionType int8) ProduceRecordsResponse {
	recordResponses, err := s.kafkaSvc.ProduceRecords(ctx, records, useTransactions, compressionType)
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
