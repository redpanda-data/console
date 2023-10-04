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

	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/kafka"
)

// progressReport is in charge of sending status updates and messages regularly to the frontend.
type progressReporter struct {
	ctx       context.Context
	logger    *zap.Logger
	request   *console.ListMessageRequest
	websocket *websocketClient

	statsMutex       *sync.RWMutex
	messagesConsumed int64
	bytesConsumed    int64
}

func (p *progressReporter) Start() {
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

func (p *progressReporter) reportProgress() {
	p.statsMutex.RLock()
	defer p.statsMutex.RUnlock()

	_ = p.websocket.writeJSON(struct {
		Type             string `json:"type"`
		MessagesConsumed int64  `json:"messagesConsumed"`
		BytesConsumed    int64  `json:"bytesConsumed"`
	}{"progressUpdate", p.messagesConsumed, p.bytesConsumed})
}

func (p *progressReporter) OnPhase(name string) {
	_ = p.websocket.writeJSON(struct {
		Type  string `json:"type"`
		Phase string `json:"phase"`
	}{"phase", name})
}

func (p *progressReporter) OnMessageConsumed(size int64) {
	p.statsMutex.Lock()
	defer p.statsMutex.Unlock()

	p.messagesConsumed++
	p.bytesConsumed += size
}

func (p *progressReporter) OnMessage(message *kafka.TopicMessage) {
	err := p.websocket.writeJSON(struct {
		Type    string              `json:"type"`
		Message *kafka.TopicMessage `json:"message"`
	}{"message", message})
	if err != nil {
		p.logger.Warn("failed to write message to websocket connection", zap.Error(err))
	}
}

func (p *progressReporter) OnComplete(elapsedMs int64, isCancelled bool) {
	p.statsMutex.RLock()
	defer p.statsMutex.RUnlock()

	_ = p.websocket.writeJSON(struct {
		Type             string `json:"type"`
		ElapsedMs        int64  `json:"elapsedMs"`
		IsCancelled      bool   `json:"isCancelled"`
		MessagesConsumed int64  `json:"messagesConsumed"`
		BytesConsumed    int64  `json:"bytesConsumed"`
	}{"done", elapsedMs, isCancelled, p.messagesConsumed, p.bytesConsumed})
}

func (p *progressReporter) OnError(message string) {
	_ = p.websocket.writeJSON(struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}{"error", message})
}
