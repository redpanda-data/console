// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package filesystem

import (
	"fmt"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// Service provides functionality to serve files from a git repository. The contents are stored in memory.
type Service struct {
	Cfg    config.Filesystem
	logger *zap.Logger

	// In memory cache for markdowns. Map key is the filename with stripped ".md" suffix.
	filesByName map[string]File
	mutex       sync.RWMutex

	OnFilesUpdatedHook func()
}

// NewService creates a new Git service with preconfigured Auth
func NewService(cfg config.Filesystem, logger *zap.Logger, onFilesUpdatedHook func()) (*Service, error) {
	childLogger := logger.With(zap.String("source", "file_provider"))

	return &Service{
		Cfg:    cfg,
		logger: childLogger,

		filesByName:        make(map[string]File),
		OnFilesUpdatedHook: onFilesUpdatedHook,
	}, nil
}

// Start to pull contents from configured paths and setup watchers to support hot reloading upon modified files.
func (c *Service) Start() error {
	if !c.Cfg.Enabled {
		return nil
	}

	// Initially do it once to ensure there's no error. Afterwards we'll do that periodically and only print errors
	// instead of propagating them back.
	loadedFiles, err := c.loadFilesIntoCache()
	if err != nil {
		return err
	}
	c.logger.Info("successfully loaded all files from filesystem into cache", zap.Int("loaded_files", loadedFiles))

	go func(refreshInterval time.Duration) {
		// Stop sync when we receive a signal
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

		ticker := time.NewTicker(refreshInterval)
		for {
			select {
			case <-quit:
				c.logger.Info("stopped sync", zap.String("reason", "received signal"))
				return
			case <-ticker.C:
				loadedFiles, err := c.loadFilesIntoCache()
				if err != nil {
					c.logger.Warn("failed to read files in file provider", zap.Error(err))
					break
				}

				if c.OnFilesUpdatedHook != nil {
					c.OnFilesUpdatedHook()
				}
				c.logger.Debug("successfully loaded all files from filesystem into cache", zap.Int("loaded_files", loadedFiles))
			}
		}
	}(c.Cfg.RefreshInterval)

	return nil
}

func (c *Service) loadFilesIntoCache() (int, error) {
	filesByName, err := c.readFiles()
	if err != nil {
		return 0, fmt.Errorf("failed to read files in file provider: %w", err)
	}

	c.setFileContents(filesByName)
	return len(filesByName), nil
}

func (c *Service) readFiles() (map[string]File, error) {
	filesByName := make(map[string]File, 0)
	foundFiles := 0
	loadedFiles := 0
	for _, p := range c.Cfg.Paths {
		absPath, err := filepath.Abs(p)
		if err != nil {
			return nil, fmt.Errorf("failed to get abs path for given path '%v': %w", p, err)
		}

		err = filepath.Walk(absPath, func(currentPath string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			if c.shouldSkip(currentPath) {
				if info.IsDir() {
					// skip the entire directory
					return filepath.SkipDir
				}

				// skip the file
				return nil
			}

			if info.IsDir() {
				return nil
			}

			foundFiles++
			isValid, trimmedFileName := c.isValidFileExtension(currentPath)
			if !isValid {
				return nil
			}

			if info.Size() > c.Cfg.MaxFileSize {
				c.logger.Info("skipped file because it is too large",
					zap.String("currentPath", currentPath),
					zap.Int64("file_size", info.Size()),
					zap.Int64("max_allowed_file_size", c.Cfg.MaxFileSize))
				return nil
			}
			loadedFiles++

			//nolint:gosec // We trust the user here and load the currentPath variable
			// which can only be provided via the configuration anyways.
			payload, err := os.ReadFile(currentPath)
			if err != nil {
				return fmt.Errorf("failed to load file '%v' from filesystem: %w", currentPath, err)
			}

			// The proto files may refer to each other. Therefore it's important to strip the base path, so that an imported
			// proto file uses the correct relative path.
			pathWithoutBasepath := strings.Trim(path.Clean(strings.Replace(currentPath, absPath, "", 1)), "\\")
			filesByName[trimmedFileName] = File{
				Path:            pathWithoutBasepath,
				Filename:        info.Name(),
				TrimmedFilename: trimmedFileName,
				Payload:         payload,
			}

			return nil
		})

		if err != nil {
			return nil, fmt.Errorf("failed to load files from file system: %w", err)
		}
	}

	return filesByName, nil
}

// setFileContents saves file contents into memory, so that they are accessible at any time.
// filesByName is a map where the key is the filename without extension suffix (e.g. "README" instead of "README.md")
func (c *Service) setFileContents(filesByName map[string]File) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.filesByName = filesByName
}

// GetFileByFilename returns the cached content for a given filename (without extension).
// The parameter must match the filename in the git repository (case sensitive).
// If there's no match nil will be returned.
func (c *Service) GetFileByFilename(fileName string) File {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	contents, exists := c.filesByName[fileName]
	if !exists {
		return File{}
	}

	return contents
}

// GetFilesByFilename returns the cached content in a map where the filename is the key (with trimmed file extension).
func (c *Service) GetFilesByFilename() map[string]File {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	return c.filesByName
}
