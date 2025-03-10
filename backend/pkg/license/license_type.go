// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package license

// Type is a string enum that determines the type of the used license.
type Type string

const (
	// TypeFreeTrial represents a free trial license.
	TypeFreeTrial Type = "free_trial"

	// TypeEnterprise represents the Redpanda Enterprise license.
	TypeEnterprise Type = "enterprise"

	// TypeOpenSource represents the default - the open source license.
	TypeOpenSource Type = "open_source"
)
