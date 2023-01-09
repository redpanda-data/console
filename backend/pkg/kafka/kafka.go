// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package kafka provides an abstraction layer for communicating with a
// target cluster via the Kafka API. For example certain requests must be sent to
// multiple brokers at the same time, which would be an additional complexity
// that could be abstracted as part of this package.
package kafka
