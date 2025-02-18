// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package console contains the implementation of all Console service RPC endpoints.
package console

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/dop251/goja"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/httptypes"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	dataplane "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

// Service that implements the ConsoleServiceHandler interface.
type Service struct {
	logger     *zap.Logger
	consoleSvc console.Servicer
}

// NewService creates a new Console service handler.
func NewService(
	logger *zap.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		logger:     logger,
		consoleSvc: consoleSvc,
	}
}

// ListMessages consumes a Kafka topic and streams the Kafka records back.
func (api *Service) ListMessages(
	ctx context.Context,
	req *connect.Request[v1alpha.ListMessagesRequest],
	stream *connect.ServerStream[v1alpha.ListMessagesResponse],
) error {
	lmq := httptypes.ListMessagesRequest{
		TopicName:             req.Msg.GetTopic(),
		StartOffset:           req.Msg.GetStartOffset(),
		StartTimestamp:        req.Msg.GetStartTimestamp(),
		PartitionID:           req.Msg.GetPartitionId(),
		MaxResults:            int(req.Msg.GetMaxResults()),
		FilterInterpreterCode: req.Msg.GetFilterInterpreterCode(),
		Enterprise:            req.Msg.GetEnterprise(),
	}

	interpreterCode, err := lmq.DecodeInterpreterCode()
	if err != nil {
		return apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("failed decoding provided interpreter code: %w", err),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	// test compile
	code := fmt.Sprintf(`var isMessageOk = function() {%s}`, interpreterCode)
	_, err = goja.Compile("", code, true)
	if err != nil {
		return apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("failed to compile provided interpreter code: %w", err),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

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
		IgnoreMaxSizeLimit:    req.Msg.GetIgnoreMaxSizeLimit(),
		KeyDeserializer:       fromProtoEncoding(req.Msg.GetKeyDeserializer()),
		ValueDeserializer:     fromProtoEncoding(req.Msg.GetValueDeserializer()),
	}

	timeout := 35 * time.Second
	if req.Msg.GetFilterInterpreterCode() != "" || req.Msg.GetStartOffset() == console.StartOffsetNewest {
		// Push-down filters and StartOffset = Newest may be long-running streams.
		// There's already a client-side provided timeout which we usually trust.
		// But additionally we want to ensure it never takes much longer than that.
		timeout = 31 * time.Minute
	}

	ctx, cancel := context.WithTimeoutCause(ctx, timeout, errors.New("list fetch timeout"))
	defer cancel()

	progress := &streamProgressReporter{
		logger:           api.logger,
		request:          &listReq,
		stream:           stream,
		messagesConsumed: atomic.Int64{},
		bytesConsumed:    atomic.Int64{},
	}
	progress.Start(ctx)

	return api.consoleSvc.ListMessages(ctx, listReq, progress)
}

// PublishMessage serialized and produces the records.
//
//nolint:gocognit // Complexity is rather high, but not unreasonable
func (api *Service) PublishMessage(
	ctx context.Context,
	req *connect.Request[v1alpha.PublishMessageRequest],
) (*connect.Response[v1alpha.PublishMessageResponse], error) {
	msg := req.Msg

	recordHeaders := make([]kgo.RecordHeader, 0, len(req.Msg.GetHeaders()))
	for _, h := range req.Msg.GetHeaders() {
		recordHeaders = append(
			recordHeaders, kgo.RecordHeader{
				Key:   h.GetKey(),
				Value: h.GetValue(),
			},
		)
	}

	keyInput := rpcPublishMessagePayloadOptionsToSerializeInput(msg.GetKey())
	valueInput := rpcPublishMessagePayloadOptionsToSerializeInput(msg.GetValue())
	compression := rpcCompressionTypeToKgoCodec(msg.GetCompression())

	prRes, prErr := api.consoleSvc.ProduceRecord(
		ctx, msg.GetTopic(), msg.GetPartitionId(), recordHeaders,
		keyInput, valueInput, req.Msg.GetUseTransactions(), compression,
	)

	if prErr == nil && prRes != nil && prRes.Error != "" {
		prErr = errors.New(prRes.Error)
	}

	if prErr != nil {
		code := connect.CodeInternal

		details := []*connect.ErrorDetail{}

		if prRes != nil {
			if len(prRes.KeyTroubleshooting) > 0 {
				code = connect.CodeInvalidArgument

				for _, ktr := range prRes.KeyTroubleshooting {
					errInfo := apierrors.NewErrorInfo(
						dataplane.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
							Key: ktr.SerdeName, Value: ktr.Message,
						},
					)

					if detail, detailErr := connect.NewErrorDetail(errInfo); detailErr == nil {
						details = append(details, detail)
					}
				}
			}

			if len(prRes.ValueTroubleshooting) > 0 {
				code = connect.CodeInvalidArgument

				for _, vtr := range prRes.ValueTroubleshooting {
					errInfo := apierrors.NewErrorInfo(
						dataplane.Reason_REASON_CONSOLE_ERROR.String(), apierrors.KeyVal{
							Key: vtr.SerdeName, Value: vtr.Message,
						},
					)

					if detail, detailErr := connect.NewErrorDetail(errInfo); detailErr == nil {
						details = append(details, detail)
					}
				}
			}
		}

		err := connect.NewError(
			code,
			prErr,
		)

		for _, ed := range details {
			ed := ed
			err.AddDetail(ed)
		}

		return nil, err
	}

	return connect.NewResponse(
		&v1alpha.PublishMessageResponse{
			Topic:       prRes.TopicName,
			PartitionId: prRes.PartitionID,
			Offset:      prRes.Offset,
		},
	), nil
}
