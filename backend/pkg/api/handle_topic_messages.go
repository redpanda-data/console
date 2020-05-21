package api

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"net/http"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi"

	"github.com/gorilla/schema"

	"github.com/gorilla/websocket"
)

func allowAll(r *http.Request) bool { return true }

// websocket upgrader options
var upgrader = websocket.Upgrader{EnableCompression: true, CheckOrigin: allowAll}

// GetTopicMessagesResponse is a wrapper for an array of TopicMessage
type GetTopicMessagesResponse struct {
	KafkaMessages *owl.ListMessageResponse `json:"kafkaMessages"`
}

// This thing is given to 'ListMessages' so it can send updates about the search to client
type progressReporter struct {
	logger  *zap.Logger
	request *owl.ListMessageRequest

	wsMutex   *sync.Mutex
	websocket *websocket.Conn

	debugDelayTicker *time.Ticker
}

func (p *progressReporter) OnPhase(name string) {
	p.wsMutex.Lock()
	defer p.wsMutex.Unlock()

	p.websocket.EnableWriteCompression(false)
	p.websocket.WriteJSON(struct {
		Type  string `json:"type"`
		Phase string `json:"phase"`
	}{"phase", name})
}

func (p *progressReporter) OnMessage(message *kafka.TopicMessage) {
	p.wsMutex.Lock()
	defer p.wsMutex.Unlock()

	//<-p.debugDelayTicker.C
	p.websocket.EnableWriteCompression(true)
	p.websocket.WriteJSON(struct {
		Type    string              `json:"type"`
		Message *kafka.TopicMessage `json:"message"`
	}{"message", message})
}

func (p *progressReporter) OnComplete(elapsedMs float64, isCancelled bool) {
	p.wsMutex.Lock()
	defer p.wsMutex.Unlock()

	p.websocket.EnableWriteCompression(false)
	p.websocket.WriteJSON(struct {
		Type        string  `json:"type"`
		ElapsedMs   float64 `json:"elapsedMs"`
		IsCancelled bool    `json:"isCancelled"`
	}{"done", elapsedMs, isCancelled})
}

func (p *progressReporter) OnError(message string) {
	p.wsMutex.Lock()
	defer p.wsMutex.Unlock()

	p.websocket.EnableWriteCompression(false)
	p.websocket.WriteJSON(struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}{"error", message})
}

func (api *API) handleGetMessages() http.HandlerFunc {
	decoder := schema.NewDecoder()
	decoder.IgnoreUnknownKeys(true)
	type request struct {
		StartOffset int64  `schema:"startOffset,required"` // -1 for newest, -2 for oldest offset
		PartitionID int32  `schema:"partitionID,required"` // -1 for all partition ids
		PageSize    uint16 `schema:"pageSize,required"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// Search Arguments
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))
		query := r.URL.Query()

		var req request
		err := decoder.Decode(&req, query)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "The given query parameters are invalid",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		// Check if logged in user is allowed to list messages for the given topic
		canViewMessages, restErr := api.Hooks.Owl.CanViewTopicMessages(r.Context(), topicName)
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

		// Websocket upgrade
		api.Logger.Debug("starting websocket connection upgrade")

		wsConnection, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			api.Logger.Error("messages endpoint websocket upgrade", zap.Error(err))
			return
		}

		// "The application *must* read the connection to process close, ..."
		// https://godoc.org/github.com/gorilla/websocket#hdr-Control_Messages
		go (func() {
			for {
				if _, _, err := wsConnection.NextReader(); err != nil {
					wsConnection.Close()
					return
				}
			}
		})()

		api.Logger.Debug("websocket connection upgrade complete")

		// Request messages from kafka and return them once we got all the messages or the context is done
		listReq := owl.ListMessageRequest{
			TopicName:    topicName,
			PartitionID:  req.PartitionID,
			StartOffset:  req.StartOffset,
			MessageCount: req.PageSize,
		}

		progress := &progressReporter{api.Logger, &listReq, &sync.Mutex{}, wsConnection, time.NewTicker(300 * time.Millisecond)}

		ctx, cancelCtx := context.WithTimeout(r.Context(), 18*time.Second)
		defer cancelCtx()

		err = api.OwlSvc.ListMessages(ctx, listReq, progress)
		if err != nil {
			progress.OnError(err.Error())
		}

		// Close connection gracefully!
		(func() {
			progress.wsMutex.Lock()
			defer progress.wsMutex.Unlock()
			err = wsConnection.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			if err != nil && err != websocket.ErrCloseSent {
				api.Logger.Debug("failed to send 'CloseNormalClosure' to ws connection", zap.Error(err))
			} else {
				//api.Logger.Debug("graceful WS close message sent")
				// the example in github.com/gorilla/websocket also does this
				time.Sleep(2 * time.Second)
			}
		})()
	}
}
