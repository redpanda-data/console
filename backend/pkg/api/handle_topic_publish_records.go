// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kgo"
)

type recordsRequest struct {
	Key     []byte                 `json:"key"`
	Value   []byte                 `json:"value"`
	Headers []recordsRequestHeader `json:"headers"`

	// PartitionID into which the record(s) shall be produced to. May be -1 for auto partitioning.
	PartitionID int32 `json:"partitionId"`
}

// KgoRecordHeaders return the headers request as part of the to be produced Kafka record.
func (r *recordsRequest) KgoRecordHeaders() []kgo.RecordHeader {
	if len(r.Headers) == 0 {
		return nil
	}
	kgoRecordHeaders := make([]kgo.RecordHeader, len(r.Headers))
	for i, header := range r.Headers {
		kgoRecordHeaders[i] = header.KgoRecordHeader()
	}
	return kgoRecordHeaders
}

// KgoRecord returns a kafka-client compatible Kafka record based on the user's request,
// so that we can produce it.
func (r *recordsRequest) KgoRecord() kgo.Record {
	return kgo.Record{
		Key:       r.Key,
		Value:     r.Value,
		Headers:   r.KgoRecordHeaders(),
		Partition: r.PartitionID,
	}
}

type recordsRequestHeader struct {
	Key   string `json:"key"`
	Value []byte `json:"value"`
}

// KgoRecordHeader returns a kafka-client compatible Record Header type based on the requested
// record headers that shall be produced as part of the Kafka record.
func (r *recordsRequestHeader) KgoRecordHeader() kgo.RecordHeader {
	return kgo.RecordHeader{
		Key:   r.Key,
		Value: r.Value,
	}
}

type publishRecordsRequest struct {
	// TopicNames is a list of topic names into which the records shall be produced to.
	TopicNames []string `json:"topicNames"`

	// CompressionType that shall be used when producing the records to Kafka.
	CompressionType int8 `json:"compressionType"`

	// UseTransactions indicates whether we should produce the records transactional. If only one record shall
	// be produced this option should always be false.
	UseTransactions bool `json:"useTransactions"`

	// Records contains one or more records (key, value, headers) that shall be produced.
	Records []recordsRequest `json:"records"`
}

// OK validates the request struct and checks for any potential error prior that can be checked without
// communicating to Kafka. It is implicitly called within rest.Decode().
func (p *publishRecordsRequest) OK() error {
	if len(p.TopicNames) == 0 {
		return fmt.Errorf("no topic names have been specified")
	}
	if len(p.Records) == 0 {
		return fmt.Errorf("no records have been specified")
	}

	return nil
}

// KgoRecords returns all kgo.Record that shall be produced.
func (p *publishRecordsRequest) KgoRecords() []*kgo.Record {
	kgoRecords := make([]*kgo.Record, 0, len(p.Records)*len(p.TopicNames))
	for _, topicName := range p.TopicNames {
		for _, rec := range p.Records {
			kgoRecord := rec.KgoRecord()
			kgoRecord.Topic = topicName
			kgoRecords = append(kgoRecords, &kgoRecord)
		}
	}
	return kgoRecords
}

func (api *API) handlePublishTopicsRecords() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req publishRecordsRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Check if logged-in user is allowed to publish records to all the specified topics
		for _, topicName := range req.TopicNames {
			canPublish, restErr := api.Hooks.Authorization.CanPublishTopicRecords(r.Context(), topicName)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
			if !canPublish {
				restErr := &rest.Error{
					Err:      fmt.Errorf("requester has no permissions to publish records in topic '%v'", topicName),
					Status:   http.StatusForbidden,
					Message:  fmt.Sprintf("You don't have permissions to publish records in topic '%v'", topicName),
					IsSilent: false,
				}
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
		}

		// 3. Submit publish topic records request
		publishRes := api.ConsoleSvc.ProduceRecords(r.Context(), req.KgoRecords(), req.UseTransactions, req.CompressionType)

		rest.SendResponse(w, r, api.Logger, http.StatusOK, publishRes)
	}
}
