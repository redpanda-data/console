// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package errors provides helper functions for constructing information rich connect errors.
package errors

import (
	"connectrpc.com/connect"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/proto"
)

// NewConnectError is a helper function to construct a new connect error.
// This function should always be used over instantiating connect errors directly,
// as we can ensure that certain error details will always be provided.
func NewConnectError(code connect.Code, innerErr error, errInfo *errdetails.ErrorInfo, errDetails ...proto.Message) *connect.Error {
	connectErr := connect.NewError(code, innerErr)

	if detail, detailErr := connect.NewErrorDetail(errInfo); detailErr == nil {
		connectErr.AddDetail(detail)
	}

	for _, msg := range errDetails {
		// We may sometimes pass in a nil object so that this function is easier
		// to use. In this case we just want to skip it.
		if msg == nil {
			continue
		}
		detail, detailErr := connect.NewErrorDetail(msg)
		if detailErr != nil {
			continue
		}
		connectErr.AddDetail(detail)
	}

	return connectErr
}

// KeyVal is a key/value pair that is used to provide additional metadata labels.
type KeyVal struct {
	Key   string
	Value string
}

// NewErrorInfo is a helper function to create a new ErrorInfo detail.
func NewErrorInfo(reason string, metadata ...KeyVal) *errdetails.ErrorInfo {
	var md map[string]string
	if len(metadata) > 0 {
		md = make(map[string]string, len(metadata))

		for _, keyVal := range metadata {
			md[keyVal.Key] = keyVal.Value
		}
	}

	return &errdetails.ErrorInfo{
		Reason:   reason,
		Domain:   DomainDataplane,
		Metadata: md,
	}
}
