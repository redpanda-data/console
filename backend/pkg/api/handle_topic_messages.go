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
	"fmt"
	"net/http"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/api/httptypes"
	"github.com/redpanda-data/console/backend/pkg/console"
)

func (api *API) handleGetMessages() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		logger := api.Logger

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		wsClient := websocketClient{
			Ctx:             ctx,
			Cancel:          cancel,
			Logger:          logger,
			Connection:      nil,
			Mutex:           &sync.RWMutex{},
			CheckOriginFunc: originsCheckFunc(api.Cfg.REST.AllowedOrigins),
		}
		if err := wsClient.upgrade(w, r); err != nil {
			api.Logger.Error("failed to upgrade HTTP connection to websocket connection",
				zap.String("request_origin", r.Header.Get("Origin")),
				zap.Error(err))
			return
		}
		defer wsClient.sendClose()

		if len(wsClient.accessToken) > 0 {
			api.Logger.Info("client has provided an accessToken in messages request")
		}

		sendError := func(msg string) {
			wsClient.writeJSON(struct {
				Type    string `json:"type"`
				Message string `json:"message"`
			}{"error", msg})
		}

		// Get search parameters. Close connection if search parameters are invalid
		var req httptypes.ListMessagesRequest
		err := wsClient.readJSON(&req)
		if err != nil {
			api.Logger.Error("failed to parse list message request on Websocket", zap.Error(err))
			sendError("Failed to parse list message request")
			return
		}
		go wsClient.readLoop()
		go wsClient.producePings()

		// Validate request parameter
		err = req.OK()
		if err != nil {
			sendError(fmt.Sprintf("Failed to validate list message request: %v", err))
			return
		}

		ctx, err = api.Hooks.Console.CheckWebsocketConnection(r, req)
		if err != nil {
			sendError(err.Error())
			return
		}

		// Check if logged in user is allowed to list messages for the given request
		canViewMessages, restErr := api.Hooks.Authorization.CanViewTopicMessages(ctx, &req)
		if restErr != nil {
			wsClient.writeJSON(restErr)
			return
		}
		if !canViewMessages {
			sendError("You don't have permissions to view messages in this topic")
			return
		}

		if len(req.FilterInterpreterCode) > 0 {
			canUseMessageSearchFilters, restErr := api.Hooks.Authorization.CanUseMessageSearchFilters(ctx, &req)
			if restErr != nil {
				sendError(restErr.Message)
				return
			}
			if !canUseMessageSearchFilters {
				sendError("You don't have permissions to use message filters in this topic")
				return
			}
		}

		interpreterCode, _ := req.DecodeInterpreterCode() // Error has been checked in validation function

		// Request messages from kafka and return them once we got all the messages or the context is done
		listReq := console.ListMessageRequest{
			TopicName:             req.TopicName,
			PartitionID:           req.PartitionID,
			StartOffset:           req.StartOffset,
			StartTimestamp:        req.StartTimestamp,
			MessageCount:          req.MaxResults,
			FilterInterpreterCode: interpreterCode,
		}
		api.Hooks.Authorization.PrintListMessagesAuditLog(ctx, r, &listReq)

		// Use 30min duration if we want to search a whole topic or forward messages as they arrive
		duration := 45 * time.Second
		if listReq.FilterInterpreterCode != "" || listReq.StartOffset == console.StartOffsetNewest {
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

		err = api.ConsoleSvc.ListMessages(childCtx, listReq, progress)
		if err != nil {
			progress.OnError(err.Error())
		}
	}
}
