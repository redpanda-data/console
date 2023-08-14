// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

const (
	// CodeSubjectNotFound is the returned error code when the requested subject
	// does not exist.
	CodeSubjectNotFound = 40401

	// CodeVersionNotFound is the returned error code when the requested version
	// does not exist.
	CodeVersionNotFound = 40402

	// CodeSchemaNotFound is the returned error code when the requested schema
	// does not exist.
	CodeSchemaNotFound = 40403
)
