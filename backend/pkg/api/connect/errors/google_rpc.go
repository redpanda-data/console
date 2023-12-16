// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package errors

import (
	"connectrpc.com/connect"
	googlestatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/types/known/anypb"
)

// ConnectErrorToGrpcStatus converts a connect.Error into the gRPC compliant
// googlestatus.Status type that can be used to present errors.
func ConnectErrorToGrpcStatus(connectErr *connect.Error) *googlestatus.Status {
	return &googlestatus.Status{
		Code:    int32(connect.CodeUnknown),
		Message: connectErr.Error(),
		Details: connectErrDetailsAsAny(connectErr.Details()),
	}
}

func connectErrDetailsAsAny(details []*connect.ErrorDetail) []*anypb.Any {
	anys := make([]*anypb.Any, 0, len(details))
	for _, detail := range details {
		protoMessage, err := detail.Value()
		if err != nil {
			continue
		}
		anyMsg, err := anypb.New(protoMessage)
		if err != nil {
			continue
		}
		anys = append(anys, anyMsg)
	}
	return anys
}
