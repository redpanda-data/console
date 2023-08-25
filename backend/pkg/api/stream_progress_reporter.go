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
	"sync/atomic"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha"
	"github.com/redpanda-data/console/backend/pkg/serde"
)

// streamProgressReporter is in charge of sending status updates and messages regularly to the frontend.
type streamProgressReporter struct {
	ctx     context.Context
	logger  *zap.Logger
	request *console.ListMessageRequest
	stream  *connect.ServerStream[v1alpha.ListMessagesResponse]

	messagesConsumed atomic.Int64
	bytesConsumed    atomic.Int64
}

func (p *streamProgressReporter) Start() {
	// If search is disabled do not report progress regularly as each consumed message will be sent through the socket
	// anyways
	if p.request.FilterInterpreterCode == "" {
		return
	}

	// Report the current progress every second to the user. If there's a search request which has to browse a whole
	// topic it may take some time until there are messages. This go routine is in charge of keeping the user up to
	// date about the progress Kowl made streaming the topic
	go func() {
		for {
			select {
			case <-p.ctx.Done():
				return
			default:
				p.reportProgress()
			}
			time.Sleep(1 * time.Second)
		}
	}()
}

func (p *streamProgressReporter) reportProgress() {
	msg := &v1alpha.ListMessagesResponse_ProgressMessage{
		MessagesConsumed: p.messagesConsumed.Load(),
		BytesConsumed:    p.bytesConsumed.Load(),
	}

	p.stream.Send(&v1alpha.ListMessagesResponse{
		ControlMessage: &v1alpha.ListMessagesResponse_Progress{
			Progress: msg,
		},
	})
}

func (p *streamProgressReporter) OnPhase(name string) {
	msg := &v1alpha.ListMessagesResponse_PhaseMessage{
		Phase: name,
	}

	p.stream.Send(&v1alpha.ListMessagesResponse{
		ControlMessage: &v1alpha.ListMessagesResponse_Phase{
			Phase: msg,
		},
	})
}

func (p *streamProgressReporter) OnMessageConsumed(size int64) {
	p.messagesConsumed.Add(1)
	p.bytesConsumed.Add(size)
}

func (p *streamProgressReporter) OnMessage(message *kafka.TopicMessage) {
	headers := make([]*v1alpha.KafkaRecordHeader, 0, len(message.Headers))

	for _, mh := range message.Headers {
		mh := mh
		headers = append(headers, &v1alpha.KafkaRecordHeader{
			Key:   mh.Key,
			Value: mh.Value,
		})
	}

	compression := v1alpha.CompressionType_COMPRESSION_TYPE_UNSPECIFIED

	// this should match pkg/kafka/consumer.go
	switch message.Compression {
	case "uncompressed":
		compression = v1alpha.CompressionType_COMPRESSION_TYPE_UNCOMPRESSED
	case "gzip":
		compression = v1alpha.CompressionType_COMPRESSION_TYPE_GZIP
	case "snappy":
		compression = v1alpha.CompressionType_COMPRESSION_TYPE_SNAPPY
	case "lz4":
		compression = v1alpha.CompressionType_COMPRESSION_TYPE_LZ4
	case "zstd":
		compression = v1alpha.CompressionType_COMPRESSION_TYPE_ZSTD
	}

	data := &v1alpha.ListMessagesResponse_DataMessage{
		Headers:         headers,
		PartitionId:     message.PartitionID,
		Offset:          message.Offset,
		Timestamp:       message.Timestamp,
		Compression:     compression,
		IsTransactional: message.IsTransactional,
		Key: &v1alpha.KafkaRecordPayload{
			OriginalPayload:   message.Key.OriginalPayload,
			PayloadSize:       int32(message.Key.PayloadSizeBytes),
			NormalizedPayload: message.Key.NormalizedPayload,
			IsPayloadTooLarge: false, // TODO check for size
			Encoding:          toProtoEncoding(message.Key.Encoding),
		},
		Value: &v1alpha.KafkaRecordPayload{
			OriginalPayload:   message.Value.OriginalPayload,
			PayloadSize:       int32(message.Value.PayloadSizeBytes),
			NormalizedPayload: message.Value.NormalizedPayload,
			IsPayloadTooLarge: false, // TODO check for size
			Encoding:          toProtoEncoding(message.Value.Encoding),
		},
	}

	data.Key.TroubleshootReport = make([]*v1alpha.TroubleshootReport, 0, len(message.Key.Troubleshooting))
	for _, ts := range message.Key.Troubleshooting {
		ts := ts
		data.Key.TroubleshootReport = append(data.Key.TroubleshootReport, &v1alpha.TroubleshootReport{
			SerdeName: ts.SerdeName,
			Message:   ts.Message,
		})
	}

	data.Value.TroubleshootReport = make([]*v1alpha.TroubleshootReport, 0, len(message.Value.Troubleshooting))
	for _, ts := range message.Value.Troubleshooting {
		ts := ts
		data.Value.TroubleshootReport = append(data.Value.TroubleshootReport, &v1alpha.TroubleshootReport{
			SerdeName: ts.SerdeName,
			Message:   ts.Message,
		})
	}

	p.stream.Send(&v1alpha.ListMessagesResponse{
		ControlMessage: &v1alpha.ListMessagesResponse_Data{
			Data: data,
		},
	})
}

func toProtoEncoding(serdeEncoding serde.PayloadEncoding) v1alpha.PayloadEncoding {
	encoding := v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY

	switch serdeEncoding {
	case serde.PayloadEncodingNone:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_NONE
	case serde.PayloadEncodingAvro:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_AVRO
	case serde.PayloadEncodingProtobuf:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF
	case serde.PayloadEncodingJSON:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON
	case serde.PayloadEncodingXML:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_XML
	case serde.PayloadEncodingText:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_TEXT
	case serde.PayloadEncodingUtf8WithControlChars:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UTF8
	case serde.PayloadEncodingMsgPack:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_MESSAGE_PACK
	case serde.PayloadEncodingSmile:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_SMILE
	case serde.PayloadEncodingConsumerOffsets:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CONSUMER_OFFSETS
	}

	return encoding
}

func (p *streamProgressReporter) OnComplete(elapsedMs int64, isCancelled bool) {
	msg := &v1alpha.ListMessagesResponse_StreamCompletedMessage{
		ElapsedMs:        elapsedMs,
		IsCancelled:      isCancelled,
		MessagesConsumed: p.messagesConsumed.Load(),
		BytesConsumed:    p.bytesConsumed.Load(),
	}

	p.stream.Send(&v1alpha.ListMessagesResponse{
		ControlMessage: &v1alpha.ListMessagesResponse_Done{
			Done: msg,
		},
	})
}

func (p *streamProgressReporter) OnError(message string) {
	msg := &v1alpha.ListMessagesResponse_ErrorMessage{
		Message: message,
	}

	p.stream.Send(&v1alpha.ListMessagesResponse{
		ControlMessage: &v1alpha.ListMessagesResponse_Error{
			Error: msg,
		},
	})
}
