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
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"connectrpc.com/connect"

	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

// streamProgressReporter is in charge of sending status updates and messages regularly to the frontend.
type streamProgressReporter struct {
	logger  *slog.Logger
	request *console.ListMessageRequest
	stream  *connect.ServerStream[v1alpha.ListMessagesResponse]

	messagesConsumed atomic.Int64
	bytesConsumed    atomic.Int64

	writeMutex sync.Mutex
}

func (p *streamProgressReporter) Start(ctx context.Context) {
	// We should report progress in two scenarios.
	// If filter is enabled it could take a while to find the matching record(s).
	// If search is for newest records it could take a while to get new records.
	// We also need to get around certain infrastructure and ingress idle connection limits.
	// With "newest" request, we may wait a while until we get a record to send.
	// While we wait for a record the connection is idle.
	// Different ingress controllers, proxies, and load balancers have different default settings for idle connections.
	// For example AWS LB has a default idle connection timeout of 1m.
	// Essentially we need a ping / keep alive message in stream to work around these idle timeouts.

	tickerDuration := 30 * time.Second
	if p.request.FilterInterpreterCode != "" {
		// For filter search we want to report more frequently
		// because we are actually curious about the progress.
		tickerDuration = time.Second
	}

	// Report the current progress every ticker togit c the user.
	// This goroutine is in charge of keeping the user up to date about the progress
	// Console made streaming the topic.
	go func() {
		ticker := time.NewTicker(tickerDuration)

		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				return
			case <-ticker.C:
				p.reportProgress()
			}
		}
	}()
}

func (p *streamProgressReporter) reportProgress() {
	p.writeMutex.Lock()
	defer p.writeMutex.Unlock()

	msg := &v1alpha.ListMessagesResponse_ProgressMessage{
		MessagesConsumed: p.messagesConsumed.Load(),
		BytesConsumed:    p.bytesConsumed.Load(),
	}

	if err := p.stream.Send(
		&v1alpha.ListMessagesResponse{
			ControlMessage: &v1alpha.ListMessagesResponse_Progress{
				Progress: msg,
			},
		},
	); err != nil {
		p.logger.Error("send error in stream reportProgress", slog.Any("error", err))
	}
}

func (p *streamProgressReporter) OnPhase(name string) {
	p.writeMutex.Lock()
	defer p.writeMutex.Unlock()

	msg := &v1alpha.ListMessagesResponse_PhaseMessage{
		Phase: name,
	}

	if err := p.stream.Send(
		&v1alpha.ListMessagesResponse{
			ControlMessage: &v1alpha.ListMessagesResponse_Phase{
				Phase: msg,
			},
		},
	); err != nil {
		p.logger.Error("send error in stream OnPhase", slog.Any("error", err))
	}
}

func (p *streamProgressReporter) OnMessageConsumed(size int64) {
	p.messagesConsumed.Add(1)
	p.bytesConsumed.Add(size)
}

func (p *streamProgressReporter) OnMessage(message *console.TopicMessage) {
	if message == nil {
		return
	}

	p.writeMutex.Lock()
	defer p.writeMutex.Unlock()

	headers := make([]*v1alpha.KafkaRecordHeader, 0, len(message.Headers))

	for _, mh := range message.Headers {
		mh := mh
		headers = append(
			headers, &v1alpha.KafkaRecordHeader{
				Key:   mh.Key,
				Value: mh.Value,
			},
		)
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
			IsPayloadTooLarge: message.Key.IsPayloadTooLarge,
			Encoding:          toProtoEncoding(message.Key.Encoding),
		},
		Value: &v1alpha.KafkaRecordPayload{
			OriginalPayload:   message.Value.OriginalPayload,
			PayloadSize:       int32(message.Value.PayloadSizeBytes),
			NormalizedPayload: message.Value.NormalizedPayload,
			IsPayloadTooLarge: message.Value.IsPayloadTooLarge,
			Encoding:          toProtoEncoding(message.Value.Encoding),
		},
	}

	if message.Key.SchemaID != nil {
		schemaID := int32(*message.Key.SchemaID)
		data.Key.SchemaId = &schemaID
	}

	if message.Value.SchemaID != nil {
		schemaID := int32(*message.Value.SchemaID)
		data.Value.SchemaId = &schemaID
	}

	data.Key.TroubleshootReport = make([]*v1alpha.TroubleshootReport, 0, len(message.Key.Troubleshooting))
	for _, ts := range message.Key.Troubleshooting {
		ts := ts
		data.Key.TroubleshootReport = append(
			data.Key.TroubleshootReport, &v1alpha.TroubleshootReport{
				SerdeName: ts.SerdeName,
				Message:   ts.Message,
			},
		)
	}

	data.Value.TroubleshootReport = make([]*v1alpha.TroubleshootReport, 0, len(message.Value.Troubleshooting))
	for _, ts := range message.Value.Troubleshooting {
		ts := ts
		data.Value.TroubleshootReport = append(
			data.Value.TroubleshootReport, &v1alpha.TroubleshootReport{
				SerdeName: ts.SerdeName,
				Message:   ts.Message,
			},
		)
	}

	if err := p.stream.Send(
		&v1alpha.ListMessagesResponse{
			ControlMessage: &v1alpha.ListMessagesResponse_Data{
				Data: data,
			},
		},
	); err != nil {
		p.logger.Error("send error in stream OnMessage", slog.Any("error", err))
	}
}

func (p *streamProgressReporter) OnComplete(elapsedMs int64, isCancelled bool) {
	p.writeMutex.Lock()
	defer p.writeMutex.Unlock()

	msg := &v1alpha.ListMessagesResponse_StreamCompletedMessage{
		ElapsedMs:        elapsedMs,
		IsCancelled:      isCancelled,
		MessagesConsumed: p.messagesConsumed.Load(),
		BytesConsumed:    p.bytesConsumed.Load(),
	}

	if err := p.stream.Send(
		&v1alpha.ListMessagesResponse{
			ControlMessage: &v1alpha.ListMessagesResponse_Done{
				Done: msg,
			},
		},
	); err != nil {
		p.logger.Error("send error in stream OnComplete", slog.Any("error", err))
	}
}

func (p *streamProgressReporter) OnError(message string) {
	p.writeMutex.Lock()
	defer p.writeMutex.Unlock()

	msg := &v1alpha.ListMessagesResponse_ErrorMessage{
		Message: message,
	}

	if err := p.stream.Send(
		&v1alpha.ListMessagesResponse{
			ControlMessage: &v1alpha.ListMessagesResponse_Error{
				Error: msg,
			},
		},
	); err != nil {
		p.logger.Error("send error in stream OnError", slog.Any("error", err))
	}
}
