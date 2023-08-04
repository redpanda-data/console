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
	"sync"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha"
)

// streamProgressReporter is in charge of sending status updates and messages regularly to the frontend.
type streamProgressReporter struct {
	ctx     context.Context
	logger  *zap.Logger
	request *console.ListMessageRequest
	stream  *connect.ServerStream[v1alpha.ListMessagesResponse]

	statsMutex       *sync.RWMutex
	messagesConsumed int64
	bytesConsumed    int64
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
}

func (p *streamProgressReporter) OnPhase(name string) {
}

func (p *streamProgressReporter) OnMessageConsumed(size int64) {
}

func (p *streamProgressReporter) OnMessage(message *kafka.TopicMessage) {
	p.stream.Send(&v1alpha.ListMessagesResponse{
		Value: &v1alpha.KafkaRecordPayload{
			OriginalPayload:     message.Value.Payload.Payload,
			PayloadSize:         int32(message.Value.Size),
			DeserializedPayload: message.Value.Payload.Payload,
			IsPayloadTooLarge:   false, // TODO check for size
		},
		Key: &v1alpha.KafkaRecordPayload{
			OriginalPayload:     message.Key.Payload.Payload,
			PayloadSize:         int32(message.Key.Size),
			DeserializedPayload: message.Key.Payload.Payload,
			IsPayloadTooLarge:   false, // TODO check for size
		},
	})
}

func (p *streamProgressReporter) OnComplete(elapsedMs int64, isCancelled bool) {
}

func (p *streamProgressReporter) OnError(message string) {
}
