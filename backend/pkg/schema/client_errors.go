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
	codeSubjectNotFound       = 40401
	codeSchemaNotFound        = 40403
	codeBackendDatastoreError = 50001
)

// IsSchemaNotFound can be used to determine if the returned error indicates
// that the requested schema does not exist.
func IsSchemaNotFound(err error) bool {
	if err == nil {
		return false
	}

	if restErr, ok := err.(RestError); ok {
		return restErr.ErrorCode == codeSchemaNotFound
	}

	return false
}
