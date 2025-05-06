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
	"errors"
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

const (
	compressionTypeNone = iota
	compressionTypeGzip
	compressionTypeSnappy
	compressionTypeLz4
	compressionTypeZstd
)

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
		return errors.New("no topic names have been specified")
	}
	if len(p.Records) == 0 {
		return errors.New("no records have been specified")
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

		// 3. Submit publish topic records request
		publishRes := api.ConsoleSvc.ProducePlainRecords(r.Context(), req.KgoRecords(), req.UseTransactions, compressionTypeToKgoCodec(req.CompressionType))

		rest.SendResponse(w, r, api.Logger, http.StatusOK, publishRes)
	}
}

// compressionTypeToKgoCodec receives the compressionType as an int8 enum and returns a slice of compression
// codecs which contains the compression codecs in preference order. It will always return the specified
// compressionType as highest preference and add "None" as fallback codec.
func compressionTypeToKgoCodec(compressionType int8) []kgo.CompressionCodec {
	switch compressionType {
	case compressionTypeNone:
		return []kgo.CompressionCodec{kgo.NoCompression()}
	case compressionTypeGzip:
		return []kgo.CompressionCodec{kgo.GzipCompression(), kgo.NoCompression()}
	case compressionTypeSnappy:
		return []kgo.CompressionCodec{kgo.SnappyCompression(), kgo.NoCompression()}
	case compressionTypeLz4:
		return []kgo.CompressionCodec{kgo.Lz4Compression(), kgo.NoCompression()}
	case compressionTypeZstd:
		return []kgo.CompressionCodec{kgo.ZstdCompression(), kgo.NoCompression()}
	default:
		return []kgo.CompressionCodec{kgo.NoCompression()}
	}
}
