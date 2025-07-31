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
	"fmt"
	"log/slog"
	"path"
	"strings"

	"github.com/go-git/go-billy/v5"

	"github.com/redpanda-data/console/backend/pkg/filesystem"
)

func readFile(fileName string, fs billy.Filesystem, maxSize int64) ([]byte, error) {
	fileInfo, err := fs.Stat(fileName)
	if err != nil {
		return nil, fmt.Errorf("failed to get file info: %w", err)
	}
	fileSize := fileInfo.Size()
	if fileSize > maxSize {
		return nil, fmt.Errorf("file size of '%d' bytes is larger than the expected max size of '%d' bytes", fileSize, maxSize)
	}

	file, err := fs.Open(fileName)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}

	contents := make([]byte, fileSize)
	_, err = file.Read(contents)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	return contents, nil
}

// readFiles recursively reads the file systems' files until it has read all files or max depth is reached.
func (c *Service) readFiles(fs billy.Filesystem, res map[string]filesystem.File, currentPath string, maxDepth int) (map[string]filesystem.File, error) {
	fileInfos, err := fs.ReadDir(currentPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read dir: %w", err)
	}

	// This case should only be entered when currentPath equals to a directory that is not existent. This could happen
	// if the configured base directory does not exist.
	if fileInfos == nil {
		c.logger.Warn("visited git directory does not exist", slog.String("current_path", currentPath))
		return res, nil
	}

	for _, info := range fileInfos {
		name := info.Name()
		filePath := path.Join(currentPath, name)
		if info.IsDir() {
			c.readFiles(fs, res, filePath, maxDepth-1)
		}

		isValid, trimmedFilename := c.isValidFileExtension(name)
		if !isValid {
			continue
		}

		content, err := readFile(filePath, fs, c.Cfg.MaxFileSize)
		if err != nil {
			c.logger.Error("failed to read file from git. file will be skipped",
				slog.String("file_name", name),
				slog.String("path", currentPath), slog.Any("error", err))
			continue
		}

		key := trimmedFilename
		if c.Cfg.IndexByFullFilepath {
			// If base is ".", don't strip dots from the path.
			if c.Cfg.Repository.BaseDirectory != "." {
				key = strings.Trim(path.Clean(strings.Replace(filePath, c.Cfg.Repository.BaseDirectory, "", 1)), "\\")
			} else {
				key = strings.Trim(path.Clean(filePath), "\\")
			}
			filePath = key
		}
		res[key] = filesystem.File{
			Path:            filePath,
			Filename:        name,
			TrimmedFilename: trimmedFilename,
			Payload:         content,
		}
	}

	return res, nil
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

// isStringInSlice returns true if the given string exists in the string slice.
func isStringInSlice(item string, arr []string) bool {
	for _, occurrence := range arr {
		if item == occurrence {
			return true
		}
	}
	return false
}
