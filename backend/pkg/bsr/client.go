// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package bsr

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	modulev1connect "buf.build/gen/go/bufbuild/registry/connectrpc/go/buf/registry/module/v1/modulev1connect"
	modulev1 "buf.build/gen/go/bufbuild/registry/protocolbuffers/go/buf/registry/module/v1"
	"connectrpc.com/connect"
	"github.com/bufbuild/protocompile/linker"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// Client is a wrapper around the Buf Schema Registry API for fetching protobuf descriptors.
type Client struct {
	cfg    config.BSR
	logger *slog.Logger

	// Connect RPC client for FileDescriptorSetService
	fileDescriptorSetClient modulev1connect.FileDescriptorSetServiceClient

	// Cache for file descriptor sets to avoid repeated API calls
	cache      map[cacheKey]*cacheEntry
	cacheMutex sync.RWMutex
}

type cacheKey struct {
	messageName string
	commit      string
}

type cacheEntry struct {
	files          linker.Files
	messageDesc    protoreflect.MessageDescriptor
	cachedAt       time.Time
	err            error
	negativeExpiry time.Time // for error caching
}

const (
	// Cache entries for 1 hour
	cacheTTL = 1 * time.Hour
	// Negative cache (errors) for 1 minute
	negativeCacheTTL = 1 * time.Minute
)

// bearerTokenInterceptor creates a Connect interceptor that adds Authorization header
func bearerTokenInterceptor(token string) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if token != "" {
				req.Header().Set("Authorization", "Bearer "+token)
			}
			return next(ctx, req)
		}
	}
}

// NewClient creates a new BSR client.
func NewClient(cfg config.BSR, logger *slog.Logger) (*Client, error) {
	if !cfg.Enabled {
		return nil, errors.New("BSR is not enabled")
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid BSR config: %w", err)
	}

	// Create HTTP client with timeout
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Create Connect client with bearer token interceptor
	fileDescriptorSetClient := modulev1connect.NewFileDescriptorSetServiceClient(
		httpClient,
		cfg.URL, // Should be full URL like https://bufbuild.internal
		connect.WithInterceptors(bearerTokenInterceptor(cfg.Token)),
	)

	return &Client{
		cfg:                     cfg,
		logger:                  logger,
		fileDescriptorSetClient: fileDescriptorSetClient,
		cache:                   make(map[cacheKey]*cacheEntry),
	}, nil
}

// GetMessageDescriptor fetches a message descriptor from BSR by message name and commit.
func (c *Client) GetMessageDescriptor(ctx context.Context, messageName, commit string) (protoreflect.MessageDescriptor, error) {
	if messageName == "" {
		return nil, errors.New("message name is empty")
	}
	if commit == "" {
		return nil, errors.New("commit is empty")
	}

	key := cacheKey{messageName: messageName, commit: commit}

	// Check cache first
	c.cacheMutex.RLock()
	entry, exists := c.cache[key]
	c.cacheMutex.RUnlock()

	if exists {
		if entry.err != nil {
			// Return cached error if within negative cache window
			if time.Now().Before(entry.negativeExpiry) {
				return nil, entry.err
			}
		} else if time.Since(entry.cachedAt) < cacheTTL {
			// Return cached success
			return entry.messageDesc, nil
		}
	}

	// Fetch from BSR
	_, messageDesc, err := c.fetchFromBSR(ctx, messageName, commit)

	// Update cache
	c.cacheMutex.Lock()
	if err != nil {
		c.cache[key] = &cacheEntry{
			err:            err,
			negativeExpiry: time.Now().Add(negativeCacheTTL),
		}
	} else {
		// Update or create cache entry with both files and descriptor
		if entry, exists := c.cache[key]; exists {
			entry.messageDesc = messageDesc
			entry.cachedAt = time.Now()
		} else {
			c.cache[key] = &cacheEntry{
				messageDesc: messageDesc,
				cachedAt:    time.Now(),
			}
		}
	}
	c.cacheMutex.Unlock()

	return messageDesc, err
}

// GetFileDescriptorSet fetches the complete file descriptor set from BSR.
// This is used for the protojson resolver when marshaling to JSON.
// Returns linker.Files which has an AsResolver() method for protojson.
func (c *Client) GetFileDescriptorSet(ctx context.Context, messageName, commit string) (linker.Files, error) {
	if messageName == "" {
		return nil, errors.New("message name is empty")
	}
	if commit == "" {
		return nil, errors.New("commit is empty")
	}

	key := cacheKey{messageName: messageName, commit: commit}

	// Check cache first
	c.cacheMutex.RLock()
	entry, exists := c.cache[key]
	c.cacheMutex.RUnlock()

	if exists {
		if entry.err != nil {
			if time.Now().Before(entry.negativeExpiry) {
				return nil, entry.err
			}
		} else if time.Since(entry.cachedAt) < cacheTTL {
			return entry.files, nil
		}
	}

	// Fetch from BSR (this will also populate the cache)
	files, _, err := c.fetchFromBSR(ctx, messageName, commit)
	return files, err
}

// fetchFromBSR fetches the file descriptor set from BSR via the Connect API.
func (c *Client) fetchFromBSR(ctx context.Context, messageName, commit string) (linker.Files, protoreflect.MessageDescriptor, error) {
	// Build request - ResourceRef with Id value to specify commit
	req := connect.NewRequest(&modulev1.GetFileDescriptorSetRequest{
		ResourceRef: &modulev1.ResourceRef{
			Value: &modulev1.ResourceRef_Id{
				Id: commit,
			},
		},
		IncludeTypes: []string{messageName},
	})

	// Call BSR API using the generated client (interceptor handles auth)
	resp, err := c.fileDescriptorSetClient.GetFileDescriptorSet(ctx, req)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to call BSR API: %w", err)
	}

	if resp.Msg == nil || resp.Msg.FileDescriptorSet == nil {
		return nil, nil, errors.New("BSR returned empty response")
	}

	// Convert FileDescriptorSet to protoregistry.Files
	protoFiles, err := protodesc.NewFiles(resp.Msg.FileDescriptorSet)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create proto files from descriptor set: %w", err)
	}

	// Convert protoregistry.Files to linker.Files
	var linkerFiles linker.Files
	protoFiles.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		file, err := linker.NewFileRecursive(fd)
		if err != nil {
			c.logger.Error("failed to create linker file", "file", fd.Path(), "error", err)
			return true // continue
		}
		linkerFiles = append(linkerFiles, file)
		return true
	})

	if len(linkerFiles) == 0 {
		return nil, nil, errors.New("no valid files in descriptor set")
	}

	// Find the message descriptor by fully qualified name
	messageDesc, err := findMessageDescriptor(protoFiles, messageName)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to find message descriptor for %q: %w", messageName, err)
	}

	// Cache both files and message descriptor
	c.cacheMutex.Lock()
	c.cache[cacheKey{messageName: messageName, commit: commit}] = &cacheEntry{
		files:       linkerFiles,
		messageDesc: messageDesc,
		cachedAt:    time.Now(),
	}
	c.cacheMutex.Unlock()

	return linkerFiles, messageDesc, nil
}

// findMessageDescriptor searches for a message descriptor by fully qualified name.
func findMessageDescriptor(files *protoregistry.Files, fullName string) (protoreflect.MessageDescriptor, error) {
	desc, err := files.FindDescriptorByName(protoreflect.FullName(fullName))
	if err != nil {
		return nil, err
	}

	messageDesc, ok := desc.(protoreflect.MessageDescriptor)
	if !ok {
		return nil, fmt.Errorf("descriptor for %q is not a message descriptor", fullName)
	}

	return messageDesc, nil
}
