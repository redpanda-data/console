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
	"time"

	modulev1connect "buf.build/gen/go/bufbuild/registry/connectrpc/go/buf/registry/module/v1/modulev1connect"
	modulev1 "buf.build/gen/go/bufbuild/registry/protocolbuffers/go/buf/registry/module/v1"
	"connectrpc.com/connect"
	"github.com/bufbuild/protocompile/linker"
	"github.com/twmb/go-cache/cache"
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

	// Cache for BSR responses containing both file descriptor sets and message descriptors
	cache *cache.Cache[string, *bsrCacheEntry]
}

// bsrCacheEntry holds both the file descriptor set and message descriptor
// returned from a single BSR API call
type bsrCacheEntry struct {
	files       linker.Files
	messageDesc protoreflect.MessageDescriptor
}

type cacheKey struct {
	messageName string
	commit      string
}

// String returns the cache key as a string for use with twmb/go-cache
func (k cacheKey) String() string {
	return k.messageName + "@" + k.commit
}

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

	// Create cache with 1 hour TTL and 1 minute error TTL
	// AutoCleanInterval ensures expired entries are actually removed from memory
	// to prevent unbounded cache growth
	cacheSettings := []cache.Opt{
		cache.MaxAge(1 * time.Hour),
		cache.MaxErrorAge(1 * time.Minute),
		cache.AutoCleanInterval(30 * time.Minute), // Clean expired entries every 30 minutes
	}

	return &Client{
		cfg:                     cfg,
		logger:                  logger,
		fileDescriptorSetClient: fileDescriptorSetClient,
		cache:                   cache.New[string, *bsrCacheEntry](cacheSettings...),
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

	// Use cache.Get which handles cache lookup and only calls the function on cache miss
	entry, err, _ := c.cache.Get(key.String(), func() (*bsrCacheEntry, error) {
		// This function is only called on cache miss
		files, desc, fetchErr := c.fetchFromBSR(ctx, messageName, commit)
		if fetchErr != nil {
			return nil, fetchErr
		}
		return &bsrCacheEntry{files: files, messageDesc: desc}, nil
	})

	if err != nil {
		return nil, err
	}
	return entry.messageDesc, nil
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

	// Use cache.Get which handles cache lookup and only calls the function on cache miss
	entry, err, _ := c.cache.Get(key.String(), func() (*bsrCacheEntry, error) {
		// This function is only called on cache miss
		files, desc, fetchErr := c.fetchFromBSR(ctx, messageName, commit)
		if fetchErr != nil {
			return nil, fetchErr
		}
		return &bsrCacheEntry{files: files, messageDesc: desc}, nil
	})

	if err != nil {
		return nil, err
	}
	return entry.files, nil
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
