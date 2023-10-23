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
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/console"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/serde"
)

// GetTopicMessagesResponse is a wrapper for an array of TopicMessage
type GetTopicMessagesResponse struct {
	KafkaMessages *console.ListMessageResponse `json:"kafkaMessages"`
}

// ListMessagesRequest represents a search message request with all search parameter. This must be public as it's
// used in Console Enterprise to implement the hooks.
type ListMessagesRequest struct {
	TopicName             string `json:"topicName"`
	StartOffset           int64  `json:"startOffset"`    // -1 for recent (newest - results), -2 for oldest offset, -3 for newest, -4 for timestamp
	StartTimestamp        int64  `json:"startTimestamp"` // Start offset by unix timestamp in ms (only considered if start offset is set to -4)
	PartitionID           int32  `json:"partitionId"`    // -1 for all partition ids
	MaxResults            int    `json:"maxResults"`
	FilterInterpreterCode string `json:"filterInterpreterCode"` // Base64 encoded code

	// Enterprise may only be set in the Enterprise mode. The JSON deserialization is deferred
	// to the enterprise backend.
	Enterprise json.RawMessage `json:"enterprise,omitempty"`
}

// OK validates the user input for the list messages request.
func (l *ListMessagesRequest) OK() error {
	if l.TopicName == "" {
		return fmt.Errorf("topic name is required")
	}

	if l.StartOffset < -4 {
		return fmt.Errorf("start offset is smaller than -4")
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

// DecodeInterpreterCode base64-decodes the provided interpreter code and returns it as a string.
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
			Ctx:             ctx,
			Cancel:          cancel,
			Logger:          logger,
			Connection:      nil,
			Mutex:           &sync.RWMutex{},
			CheckOriginFunc: originsCheckFunc(api.Cfg.REST.AllowedOrigins),
		}
		if err := wsClient.upgrade(w, r); err != nil {
			api.Logger.Error("failed to upgrade HTTP connection to websocket connection", zap.Error(err))
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
		var req ListMessagesRequest
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

// ListMessages consumes a Kafka topic and streams the Kafka records back.
func (api *API) ListMessages(ctx context.Context, req *connect.Request[v1alpha.ListMessagesRequest], stream *connect.ServerStream[v1alpha.ListMessagesResponse]) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	lmq := ListMessagesRequest{
		TopicName:             req.Msg.GetTopic(),
		StartOffset:           req.Msg.GetStartOffset(),
		StartTimestamp:        req.Msg.GetStartTimestamp(),
		PartitionID:           req.Msg.GetPartitionId(),
		MaxResults:            int(req.Msg.GetMaxResults()),
		FilterInterpreterCode: req.Msg.GetFilterInterpreterCode(),
		Enterprise:            req.Msg.GetEnterprise(),
	}

	// Check if logged in user is allowed to list messages for the given request
	canViewMessages, restErr := api.Hooks.Authorization.CanViewTopicMessages(ctx, &lmq)
	if restErr != nil || !canViewMessages {
		if restErr != nil {
			err := errors.New("you don't have permissions to view Kafka topic messages")
			if restErr.Err != nil {
				err = restErr.Err
			}
			return apierrors.NewConnectError(
				connect.CodePermissionDenied,
				err,
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_PERMISSION_DENIED.String()),
			)
		}
	}

	if len(lmq.FilterInterpreterCode) > 0 {
		canUseMessageSearchFilters, restErr := api.Hooks.Authorization.CanUseMessageSearchFilters(ctx, &lmq)
		if restErr != nil || !canUseMessageSearchFilters {
			err := errors.New("you don't have permissions to use search filters")
			if restErr.Err != nil {
				err = restErr.Err
			}
			return apierrors.NewConnectError(
				connect.CodePermissionDenied,
				err,
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_PERMISSION_DENIED.String()),
			)
		}
	}

	interpreterCode, _ := lmq.DecodeInterpreterCode() // Error has been checked in validation function

	// Request messages from kafka and return them once we got all the messages or the context is done
	listReq := console.ListMessageRequest{
		TopicName:             lmq.TopicName,
		PartitionID:           lmq.PartitionID,
		StartOffset:           lmq.StartOffset,
		StartTimestamp:        lmq.StartTimestamp,
		MessageCount:          lmq.MaxResults,
		FilterInterpreterCode: interpreterCode,
		Troubleshoot:          req.Msg.GetTroubleshoot(),
		IncludeRawPayload:     req.Msg.GetIncludeOriginalRawPayload(),
		KeyDeserializer:       fromProtoEncoding(req.Msg.GetKeyDeserializer()),
		ValueDeserializer:     fromProtoEncoding(req.Msg.GetValueDeserializer()),
	}

	api.Hooks.Authorization.PrintListMessagesAuditLog(ctx, req, &listReq)

	// Use 30min duration if we want to search a whole topic or forward messages as they arrive
	duration := 45 * time.Second
	if listReq.FilterInterpreterCode != "" || listReq.StartOffset == console.StartOffsetNewest {
		duration = 30 * time.Minute
	}

	childCtx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()

	progress := &streamProgressReporter{
		ctx:              childCtx,
		logger:           api.Logger,
		request:          &listReq,
		stream:           stream,
		messagesConsumed: atomic.Int64{},
		bytesConsumed:    atomic.Int64{},
	}
	progress.Start()

	return api.ConsoleSvc.ListMessages(childCtx, listReq, progress)
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
	case serde.PayloadEncodingProtobufSchema:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA
	case serde.PayloadEncodingJSON:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON
	case serde.PayloadEncodingJSONSchema:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON_SCHEMA
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
	case serde.PayloadEncodingUint:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UINT
	case serde.PayloadEncodingBinary:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY
	case serde.PayloadEncodingConsumerOffsets:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CONSUMER_OFFSETS
	case serde.PayloadEncodingUnspecified:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED
	}

	return encoding
}

func fromProtoEncoding(protoEncoding v1alpha.PayloadEncoding) serde.PayloadEncoding {
	encoding := serde.PayloadEncodingUnspecified

	switch protoEncoding {
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
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY:
		encoding = serde.PayloadEncodingBinary
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CONSUMER_OFFSETS:
		encoding = serde.PayloadEncodingConsumerOffsets
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED:
		encoding = serde.PayloadEncodingUnspecified
	}

	return encoding
}
