// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testutil

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// ImageConfig represents a Docker image configuration.
type ImageConfig struct {
	Repository string `json:"repository"`
	Tag        string `json:"tag"`
}

// String returns the full image reference (repository:tag or repository@digest).
func (c ImageConfig) String() string {
	if strings.HasPrefix(c.Tag, "sha256:") {
		return c.Repository + "@" + c.Tag
	}
	return c.Repository + ":" + c.Tag
}

type imagesConfig struct {
	Images map[string]ImageConfig `json:"images"`
}

var (
	configOnce   sync.Once
	parsedConfig imagesConfig
	errConfig    error
)

func findTestImagesJSON() (string, error) {
	// Get the directory of this source file
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", errors.New("failed to get current file path")
	}

	// Navigate from backend/pkg/testutil to repo root
	dir := filepath.Dir(currentFile)
	for range 10 {
		candidate := filepath.Join(dir, "test-images.json")
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return "", errors.New("test-images.json not found")
}

func loadConfig() (imagesConfig, error) {
	configOnce.Do(func() {
		path, err := findTestImagesJSON()
		if err != nil {
			errConfig = err
			return
		}

		//nolint:gosec // G304: path is derived from runtime.Caller, not user input
		data, err := os.ReadFile(path)
		if err != nil {
			errConfig = fmt.Errorf("failed to read test-images.json: %w", err)
			return
		}

		errConfig = json.Unmarshal(data, &parsedConfig)
	})
	return parsedConfig, errConfig
}

func getImage(name, envVar string) string {
	// Check environment variable override first
	if override := os.Getenv(envVar); override != "" {
		return override
	}

	cfg, err := loadConfig()
	if err != nil {
		panic(fmt.Sprintf("failed to load test-images.json: %v", err))
	}

	img, ok := cfg.Images[name]
	if !ok {
		panic(fmt.Sprintf("image %q not found in test-images.json", name))
	}

	return img.String()
}

// RedpandaImage returns the Docker image for Redpanda tests.
// Can be overridden with TEST_IMAGE_REDPANDA environment variable.
func RedpandaImage() string {
	return getImage("redpanda", "TEST_IMAGE_REDPANDA")
}

// KafkaConnectImage returns the Docker image for Kafka Connect tests.
// Can be overridden with TEST_IMAGE_KAFKA_CONNECT environment variable.
func KafkaConnectImage() string {
	return getImage("kafkaConnect", "TEST_IMAGE_KAFKA_CONNECT")
}

// OwlShopImage returns the Docker image for OwlShop tests.
// Can be overridden with TEST_IMAGE_OWL_SHOP environment variable.
func OwlShopImage() string {
	return getImage("owlShop", "TEST_IMAGE_OWL_SHOP")
}
