// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package errors

import (
	"errors"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
)

// NewRedpandaAdminAPINotConfiguredError is a standard error to return if an endpoint
// requires the Redpanda Admin API to be configured, but it isn't.
func NewRedpandaAdminAPINotConfiguredError() *connect.Error {
	return NewConnectError(
		connect.CodeUnimplemented,
		errors.New("the redpanda admin api must be configured to use this endpoint"),
		NewErrorInfo(commonv1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
		NewHelp(NewHelpLinkConsoleReferenceConfig()),
	)
}

// NewRedpandaFeatureNotSupportedError is a standard error to return if an endpoint
// requires the Redpanda feature that is not supported with current running version and instance.
func NewRedpandaFeatureNotSupportedError(feature string) *connect.Error {
	return NewConnectError(
		connect.CodeUnimplemented,
		errors.New("redpanda version does not support feature: "+feature),
		NewErrorInfo(commonv1alpha1.Reason_REASON_FEATURE_NOT_SUPPORTED.String(), []KeyVal{
			{
				Key:   "feature",
				Value: feature,
			},
		}...),
		NewHelp(NewHelpLinkConsoleReferenceConfig()),
	)
}
