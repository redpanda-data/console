// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package git

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/redpanda-data/console/backend/pkg/config"
)

func TestIsValidFileExtension(t *testing.T) {
	markdownSvc := Service{
		Cfg: config.Git{
			AllowedFileExtensions: []string{"md"},
		},
	}

	tests := []struct {
		input               string
		wantIsValid         bool
		wantTrimmedFilename string
	}{
		{input: "test.md", wantIsValid: true, wantTrimmedFilename: "test"},
		{input: ".md", wantIsValid: true, wantTrimmedFilename: ""},
		{input: "test.MD", wantIsValid: false, wantTrimmedFilename: "test"},
		{input: "test.bin", wantIsValid: false, wantTrimmedFilename: "test"},
		{input: "weird-file.", wantIsValid: false, wantTrimmedFilename: "weird-file"},
	}

	for _, tc := range tests {
		isValid, trimmedFilename := markdownSvc.isValidFileExtension(tc.input)
		assert.Equal(t, tc.wantIsValid, isValid)
		assert.Equal(t, tc.wantTrimmedFilename, trimmedFilename)
	}
}
