// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package interceptor

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"

	"github.com/redpanda-data/console/backend/pkg/logging"
)

var _ connect.Interceptor = &ErrorLogInterceptor{}

// ErrorLogInterceptor prints access error log messages whenever a connect
// handler returned an error. Some errors may not be printed here, because they
// are written before the interceptors would be called, such as:
// - Authentication errors (enterprise HTTP middleware)
// - JSON Unmarshalling errors of request body (happens prior calling interceptors)
type ErrorLogInterceptor struct{}

// NewErrorLogInterceptor creates a new ErrorLogInterceptor.
func NewErrorLogInterceptor() *ErrorLogInterceptor {
	return &ErrorLogInterceptor{}
}

// WrapUnary creates an interceptor to validate Connect requests.
func (in *ErrorLogInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		// 1. Gather request information
		start := time.Now()

		// For HTTP paths invoked via gRPC gateway procedure is expected not to be set.
		// Let's try to retrieve it with gRPC gateway's runtime pkg.
		procedure := req.Spec().Procedure
		if procedure == "" {
			path, ok := runtime.RPCMethod(ctx)
			if !ok {
				procedure = "unknown"
			} else {
				procedure = path
			}
		}

		protocol := req.Peer().Protocol
		if protocol == "" {
			protocol = "http"
		}

		// Depending on the error case, the request size may be 0 for
		// requests sent via the gRPC gateway.
		var requestSize int
		if req != nil {
			if msg, ok := req.Any().(proto.Message); ok {
				requestSize = proto.Size(msg)
			}
		}

		// 2. Execute request
		response, err := next(ctx, req)

		// 3. Gather response information
		requestDuration := time.Since(start)
		statusCodeStr := in.statusCode(protocol, err)

		// 4. If no error there's nothing to log here
		if err == nil {
			return response, nil
		}

		// 5. Skip error response we aren't interested in
		if connect.CodeOf(err) == connect.CodeUnimplemented {
			return response, err
		}

		// 6. Log error details with decorated logger
		logger := logging.FromContext(ctx)
		logger.Warn("",
			zap.String("timestamp", start.Format(time.RFC3339)),
			zap.String("procedure", procedure),
			zap.String("request_duration", requestDuration.String()),
			zap.String("status_code", statusCodeStr),
			zap.Int("request_size_bytes", requestSize),
			zap.String("peer_address", req.Peer().Addr), // Will be empty for requests made through gRPC GW
			zap.Error(err),
		)
		return response, err
	}
}

// WrapStreamingClient is the middleware handler for bidirectional requests from
// the client perspective.
func (*ErrorLogInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// WrapStreamingHandler is the middleware handler for bidirectional requests from
// the server handling perspective.
func (*ErrorLogInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}

func (*ErrorLogInterceptor) statusCode(protocol string, serverErr error) string {
	httpProtocol := "http"

	// Following the respective specifications, use integers and "status_code" for
	// gRPC codes in contrast to strings and "error_code" for Connect codes.
	// TODO: Check protocol case for gRPC gateway
	switch protocol {
	case connect.ProtocolGRPC, connect.ProtocolGRPCWeb, httpProtocol:
		if serverErr != nil {
			return connect.CodeOf(serverErr).String()
		}
		return "ok"
	case connect.ProtocolConnect:
		if connect.IsNotModifiedError(serverErr) {
			// A "not modified" error is special: it's code is technically "unknown" but
			// it would be misleading to label it as an unknown error since it's not really
			// an error, but rather a sentinel to trigger a "304 Not Modified" HTTP status.
			return "not_modified"
		}
		if serverErr != nil {
			return connect.CodeOf(serverErr).String()
		}
		return "ok"
	}
	// This will yield "unknown" if serverErr is not known or the protocol
	// is not a known protocol.
	return connect.CodeOf(serverErr).String()
}
