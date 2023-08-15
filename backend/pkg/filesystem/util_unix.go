// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build !windows

package filesystem

import (
	"path/filepath"
	"strings"
)

// isHidden returns true if the path refers to a file that is hidden, i.e.
// - either the file belongs to a hidden folder
// - or the file itself is a hidden file
func (c *Service) isHidden(path string) bool {
	return strings.HasPrefix(filepath.Base(path), ".")
}