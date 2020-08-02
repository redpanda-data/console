package api

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/cloudhut/kowl/backend/pkg/owl"

	"github.com/cloudhut/common/rest"
)

// GetTopicMessagesResponse is a wrapper for an array of TopicMessage
type GetTopicMessagesResponse struct {
	KafkaMessages *owl.ListMessageResponse `json:"kafkaMessages"`
}

// ListMessageRequest represents a search message request with all search parameter. This must be public as it's
// used in Kowl business to implement the hooks.
type ListMessagesRequest struct {
	TopicName             string `json:"topicName"`
	StartOffset           int64  `json:"startOffset"` // -1 for recent (newest - results), -2 for oldest offset, -3 for newest
	PartitionID           int32  `json:"partitionId"` // -1 for all partition ids
	MaxResults            uint16 `json:"maxResults"`
	FilterInterpreterCode string `json:"filterInterpreterCode"` // Base64 encoded code
}

func (l *ListMessagesRequest) OK() error {
	if l.TopicName == "" {
		return fmt.Errorf("topic name is required")
	}

	if l.StartOffset < -3 {
		return fmt.Errorf("start offset is smaller than -3")
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

func (l *ListMessagesRequest) DecodeInterpreterCode() (string, error) {
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

		wsClient := websocketClient{
			Ctx:        ctx,
			Cancel:     cancel,
			Logger:     logger,
			Connection: nil,
			Mutex:      &sync.RWMutex{},
		}
		restErr := wsClient.upgrade(w, r)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		defer wsClient.sendClose()

		// Get search parameters. Close connection if search parameters are invalid
		var req ListMessagesRequest
		err := wsClient.readJSON(&req)
		if err != nil {
			wsClient.writeJSON(rest.Error{
				Err:     err,
				Status:  http.StatusBadRequest,
				Message: "Failed to parse list message request",
			})
			return
		}
		go wsClient.readLoop()
		go wsClient.producePings()

		// Validate request parameter
		err = req.OK()
		if err != nil {
			wsClient.writeJSON(rest.Error{
				Err:     err,
				Status:  http.StatusBadRequest,
				Message: fmt.Sprintf("Failed to validate list message request: %v", err),
			})
			return
		}

		// Check if logged in user is allowed to list messages for the given request
		canViewMessages, restErr := api.Hooks.Owl.CanViewTopicMessages(r.Context(), req)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canViewMessages {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view messages for the given request"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view messages in this topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		if len(req.FilterInterpreterCode) > 0 {
			canUseMessageSearchFilters, restErr := api.Hooks.Owl.CanUseMessageSearchFilters(r.Context(), req)
			if restErr != nil {
				rest.SendRESTError(w, r, logger, restErr)
				return
			}
			if !canUseMessageSearchFilters {
				restErr := &rest.Error{
					Err:      fmt.Errorf("requester has no permissions to message search filters for the given request"),
					Status:   http.StatusForbidden,
					Message:  "You don't have permissions to use message filters in this topic",
					IsSilent: false,
				}
				rest.SendRESTError(w, r, logger, restErr)
				return
			}
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

		// Use 30min duration if we want to search a whole topic or forward messages as they arrive
		duration := 18 * time.Second
		if listReq.FilterInterpreterCode != "" || listReq.StartOffset == owl.StartOffsetNewest {
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

		err = api.OwlSvc.ListMessages(childCtx, listReq, progress)
		if err != nil {
			progress.OnError(err.Error())
		}
	}
}
