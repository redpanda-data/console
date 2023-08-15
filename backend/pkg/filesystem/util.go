// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package filesystem

import "strings"

// isStringInSlice returns true if the given string exists in the string slice.
func isStringInSlice(item string, arr []string) bool {
	for _, occurrence := range arr {
		if item == occurrence {
			return true
		}
	}
	return false
}

// isHiddenFile returns true if the filename refers to a file that is hidden, i.e.
// - either the file belongs to a hidden folder (tmp/..hiddenFolder/file)
// - or the file itself is a hidden file (tmp/data/.hiddenFile)
func (c *Service) isHiddenFile(filename string) bool {
	return strings.Contains(filepath, "/.")
}

// isValidFileExtension returns:
// 1. a bool which indicates whether the given filename has one of the allowed file extensions
// 2. a string that is the filename with the trimmed extension suffix (e.g. "readme" instead of "readme.md")
func (c *Service) isValidFileExtension(filename string) (bool, string) {
	i := strings.LastIndex(filename, ".")
	if i == -1 {
		// No file extension
		if c.Cfg.AllowedFileExtensions == nil {
			return true, filename
		}
		return false, filename
	}

	extension := filename[i+1:]
	trimmedFilename := strings.TrimSuffix(filename, "."+extension)
	if isStringInSlice(extension, c.Cfg.AllowedFileExtensions) {
		return true, trimmedFilename
	}
	return false, trimmedFilename
}

// shouldSkipFile returns true if the given file needs to be skipped
func (c *Service) shouldSkipFile(filename string) bool {
	if c.Cfg.SkipHiddenFiles && isHiddenFile(filename) {
		return true
	}

	return false
}
