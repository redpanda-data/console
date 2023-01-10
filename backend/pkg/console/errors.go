// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import "errors"

// ErrSchemaRegistryNotConfigured is an error that declares the schema registry has not
// been configured in Redpanda Console and thus the request could not be processed.
var ErrSchemaRegistryNotConfigured = errors.New("no schema registry configured")
