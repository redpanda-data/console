package api

import (
	"context"
	"encoding/base64"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"net/http"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/cloudhut/common/rest"
)

// GetTopicMessagesResponse is a wrapper for an array of TopicMessage
type GetTopicMessagesResponse struct {
	KafkaMessages *owl.ListMessageResponse `json:"kafkaMessages"`
}

// progressReport is in charge of sending status updates and messages regularly to the frontend.
type progressReporter struct {
	ctx       context.Context
	logger    *zap.Logger
	request   *owl.ListMessageRequest
	websocket *WebsocketClient

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

	_ = p.websocket.WriteJSON(struct {
		Type             string `json:"type"`
		MessagesConsumed int64  `json:"messagesConsumed"`
		BytesConsumed    int64  `json:"bytesConsumed"`
	}{"progressUpdate", p.messagesConsumed, p.bytesConsumed})
}

func (p *progressReporter) OnPhase(name string) {
	_ = p.websocket.WriteJSON(struct {
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
	_ = p.websocket.WriteJSON(struct {
		Type    string              `json:"type"`
		Message *kafka.TopicMessage `json:"message"`
	}{"message", message})
}

func (p *progressReporter) OnComplete(elapsedMs float64, isCancelled bool) {
	_ = p.websocket.WriteJSON(struct {
		Type             string  `json:"type"`
		ElapsedMs        float64 `json:"elapsedMs"`
		IsCancelled      bool    `json:"isCancelled"`
		MessagesConsumed int64   `json:"messagesConsumed"`
		BytesConsumed    int64   `json:"bytesConsumed"`
	}{"done", elapsedMs, isCancelled, p.messagesConsumed, p.bytesConsumed})
}

func (p *progressReporter) OnError(message string) {
	_ = p.websocket.WriteJSON(struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}{"error", message})
}

type listMessagesRequest struct {
	TopicName             string `json:"topicName"`
	StartOffset           int64  `json:"startOffset"` // -1 for newest, -2 for oldest offset
	PartitionID           int32  `json:"partitionId"` // -1 for all partition ids
	MaxResults            uint16 `json:"maxResults"`
	FilterInterpreterCode string `json:"filterInterpreterCode"` // Base64 encoded code
}

func (l *listMessagesRequest) OK() error {
	if l.TopicName == "" {
		return fmt.Errorf("topic name is required")
	}

	if l.StartOffset < -2 {
		return fmt.Errorf("start offset is smaller than -2")
	}

	if l.PartitionID < -1 {
		return fmt.Errorf("partitionID is smaller than -1")
	}

	if l.MaxResults <= 0 || l.MaxResults > 500 {
		return fmt.Errorf("max results must be between 1 and 500")
	}

	if _, err := l.DecodeInterpreterCode(); err != nil {
		return fmt.Errorf("failed to decode interpreter code %w", err)
	}

	return nil
}

func (l *listMessagesRequest) DecodeInterpreterCode() (string, error) {
	code, err := base64.StdEncoding.DecodeString(l.FilterInterpreterCode)
	if err != nil {
		return "", err
	}

	return string(code), nil
}

func (api *API) handleGetMessages() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger := api.Logger

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		wsClient := WebsocketClient{
			Ctx:        ctx,
			Cancel:     cancel,
			Logger:     logger,
			Connection: nil,
			Mutex:      &sync.RWMutex{},
		}
		restErr := wsClient.Upgrade(w, r)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		defer wsClient.SendClose()

		// Get search parameters. Close connection if search parameters are invalid
		var req listMessagesRequest
		err := wsClient.ReadJSON(&req)
		if err != nil {
			rest.SendRESTError(w, r, logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "Failed to parse list message request",
				IsSilent: false,
			})
			return
		}

		// Validate request parameter
		err = req.OK()
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  fmt.Sprintf("Failed to validate list message request: %v", err),
				IsSilent: false,
			})
			return
		}

		// Check if logged in user is allowed to list messages for the given topic
		canViewMessages, restErr := api.Hooks.Owl.CanViewTopicMessages(r.Context(), req.TopicName)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canViewMessages {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view messages in the requested topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view messages in that topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		interpreterCode, _ := req.DecodeInterpreterCode() // Error has been checked in validation function

		// Request messages from kafka and return them once we got all the messages or the context is done
		listReq := owl.ListMessageRequest{
			TopicName:             req.TopicName,
			PartitionID:           req.PartitionID,
			StartOffset:           req.StartOffset,
			MessageCount:          req.MaxResults,
			FilterInterpreterCode: interpreterCode,
		}

		// Use 30min duration if we want to search a whole topic
		duration := 18 * time.Second
		if listReq.FilterInterpreterCode != "" {
			duration = 30 * time.Minute
		}
		childCtx, cancel := context.WithTimeout(ctx, duration)
		defer cancel()

		progress := &progressReporter{
			ctx:              childCtx,
			logger:           api.Logger,
			request:          &listReq,
			websocket:        &wsClient,
			statsMutex:       &sync.RWMutex{},
			messagesConsumed: 0,
			bytesConsumed:    0,
		}
		progress.Start()

		err = api.OwlSvc.ListMessages(ctx, listReq, progress)
		if err != nil {
			progress.OnError(err.Error())
		}
	}
}
