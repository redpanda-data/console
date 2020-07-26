package api

import (
	"context"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"go.uber.org/zap"
	"sync"
	"time"
)

// progressReport is in charge of sending status updates and messages regularly to the frontend.
type progressReporter struct {
	ctx       context.Context
	logger    *zap.Logger
	request   *owl.ListMessageRequest
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
	_ = p.websocket.writeJSON(struct {
		Type    string              `json:"type"`
		Message *kafka.TopicMessage `json:"message"`
	}{"message", message})
}

func (p *progressReporter) OnComplete(elapsedMs float64, isCancelled bool) {
	p.statsMutex.RLock()
	defer p.statsMutex.RUnlock()

	_ = p.websocket.writeJSON(struct {
		Type             string  `json:"type"`
		ElapsedMs        float64 `json:"elapsedMs"`
		IsCancelled      bool    `json:"isCancelled"`
		MessagesConsumed int64   `json:"messagesConsumed"`
		BytesConsumed    int64   `json:"bytesConsumed"`
	}{"done", elapsedMs, isCancelled, p.messagesConsumed, p.bytesConsumed})
}

func (p *progressReporter) OnError(message string) {
	_ = p.websocket.writeJSON(struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}{"error", message})
}
