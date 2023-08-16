// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build windows

package filesystem

import (
	"syscall"
)

// isHidden returns true if the path refers to a file that is hidden, i.e.
// - either the file belongs to a hidden folder
// - or the file itself is a hidden file
func isHidden(path string) bool {
	// Appending `\\?\` to the absolute path helps with preventing 'Path Not Specified Error'
	// when accessing long paths and filenames
	// https://docs.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation?tabs=cmd
	pointer, err := syscall.UTF16PtrFromString(`\\?\` + path)
	if err != nil {
		return false
	}

	attributes, err := syscall.GetFileAttributes(pointer)
	if err != nil {
		return false
	}

	if attributes&syscall.FILE_ATTRIBUTE_HIDDEN != 0 {
		return true
	}

	return false
}
