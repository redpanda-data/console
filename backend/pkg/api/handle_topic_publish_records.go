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
	"context"
	"errors"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kgo"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	dataplane "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/serde"
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
		publishRes := api.ConsoleSvc.ProduceRecords(r.Context(), req.KgoRecords(), req.UseTransactions, compressionTypeToKgoCodec(req.CompressionType))

		rest.SendResponse(w, r, api.Logger, http.StatusOK, publishRes)
	}
}

// PublishMessage serialized and produces the records.
//
//nolint:gocognit // complicated response logic
func (api *API) PublishMessage(ctx context.Context, req *connect.Request[v1alpha.PublishMessageRequest]) (*connect.Response[v1alpha.PublishMessageResponse], error) {
	msg := req.Msg

	canPublish, restErr := api.Hooks.Authorization.CanPublishTopicRecords(ctx, msg.GetTopic())
	if restErr != nil || !canPublish {
		return nil, connect.NewError(connect.CodePermissionDenied, restErr.Err)
	}

	recordHeaders := make([]kgo.RecordHeader, 0, len(req.Msg.GetHeaders()))
	for _, h := range req.Msg.GetHeaders() {
		recordHeaders = append(recordHeaders, kgo.RecordHeader{
			Key:   h.GetKey(),
			Value: h.GetValue(),
		})
	}

	keyInput := rpcPublishMessagePayloadOptionsToSerializeInput(msg.GetKey())
	valueInput := rpcPublishMessagePayloadOptionsToSerializeInput(msg.GetValue())
	compression := rpcCompressionTypeToKgoCodec(msg.GetCompression())

	prRes, prErr := api.ConsoleSvc.PublishRecord(ctx, msg.GetTopic(), msg.GetPartitionId(), recordHeaders,
		keyInput, valueInput, req.Msg.GetUseTransactions(), compression)

	if prErr == nil && prRes != nil && prRes.Error != "" {
		prErr = errors.New(prRes.Error)
	}

	if prErr != nil {
		code := connect.CodeInternal

		details := []*connect.ErrorDetail{}

		if prRes != nil {
			if len(prRes.KeyTroubleshooting) > 0 {
				code = connect.CodeInvalidArgument

				for _, ktr := range prRes.KeyTroubleshooting {
					errInfo := apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
						Key: ktr.SerdeName, Value: ktr.Message,
					})

					if detail, detailErr := connect.NewErrorDetail(errInfo); detailErr == nil {
						details = append(details, detail)
					}
				}
			}

			if len(prRes.ValueTroubleshooting) > 0 {
				code = connect.CodeInvalidArgument

				for _, vtr := range prRes.ValueTroubleshooting {
					errInfo := apierrors.NewErrorInfo(dataplane.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
						Key: vtr.SerdeName, Value: vtr.Message,
					})

					if detail, detailErr := connect.NewErrorDetail(errInfo); detailErr == nil {
						details = append(details, detail)
					}
				}
			}
		}

		err := connect.NewError(
			code,
			prErr,
		)

		for _, ed := range details {
			ed := ed
			err.AddDetail(ed)
		}

		return nil, err
	}

	return connect.NewResponse(&v1alpha.PublishMessageResponse{
		Topic:       prRes.TopicName,
		PartitionId: prRes.PartitionID,
		Offset:      prRes.Offset,
	}), nil
}

func rpcPublishMessagePayloadOptionsToSerializeInput(po *v1alpha.PublishMessagePayloadOptions) *serde.RecordPayloadInput {
	encoding := serde.PayloadEncodingBinary

	switch po.GetEncoding() {
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_NONE:
		encoding = serde.PayloadEncodingNone
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_AVRO:
		encoding = serde.PayloadEncodingAvro
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF:
		encoding = serde.PayloadEncodingProtobuf
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA:
		encoding = serde.PayloadEncodingProtobufSchema
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON:
		encoding = serde.PayloadEncodingJSON
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON_SCHEMA:
		encoding = serde.PayloadEncodingJSONSchema
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_XML:
		encoding = serde.PayloadEncodingXML
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_TEXT:
		encoding = serde.PayloadEncodingText
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UTF8:
		encoding = serde.PayloadEncodingUtf8WithControlChars
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_MESSAGE_PACK:
		encoding = serde.PayloadEncodingMsgPack
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_SMILE:
		encoding = serde.PayloadEncodingSmile
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UINT:
		encoding = serde.PayloadEncodingUint
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED,
		v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY,
		v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CONSUMER_OFFSETS:
		encoding = serde.PayloadEncodingBinary
	}

	input := &serde.RecordPayloadInput{
		Payload:  po.GetData(),
		Encoding: encoding,
	}

	if po.GetSchemaId() > 0 {
		input.Options = []serde.SerdeOpt{serde.WithSchemaID(uint32(po.GetSchemaId()))}
	}

	if po.GetIndex() > 0 {
		input.Options = append(input.Options, serde.WithIndex(int(po.GetIndex())))
	}

	return input
}

func rpcCompressionTypeToKgoCodec(compressionType v1alpha.CompressionType) []kgo.CompressionCodec {
	switch compressionType {
	case v1alpha.CompressionType_COMPRESSION_TYPE_UNCOMPRESSED, v1alpha.CompressionType_COMPRESSION_TYPE_UNSPECIFIED:
		return []kgo.CompressionCodec{kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_GZIP:
		return []kgo.CompressionCodec{kgo.GzipCompression(), kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_SNAPPY:
		return []kgo.CompressionCodec{kgo.SnappyCompression(), kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_LZ4:
		return []kgo.CompressionCodec{kgo.Lz4Compression(), kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_ZSTD:
		return []kgo.CompressionCodec{kgo.ZstdCompression(), kgo.NoCompression()}
	default:
		return []kgo.CompressionCodec{kgo.NoCompression()}
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
