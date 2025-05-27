// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package tls contains tools to deal with TLS certificates and authorities.
package tls

import (
	"context"
	"fmt"
	"strings"

	"github.com/twmb/tlscfg"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// ClientForGRPC can be used to construct a standard GRPC client with the TLS
// configuration specified.
func ClientForGRPC(ctx context.Context, cfg *config.TLS, addr string, logger *zap.Logger) (*grpc.ClientConn, error) {
	var grpcOpts []grpc.DialOption
	if cfg != nil && cfg.Enabled {
		var opts []tlscfg.Opt
		if cfg.CaFilepath == "" {
			// The server will be protected by a public LE cert
			opts = append(opts, tlscfg.WithSystemCertPool())
		} else {
			hostname := strings.SplitN(addr, ":", 2)[0]
			opts = append(opts, tlscfg.WithOverride(MaybeWithDynamicClientCA(ctx,
				cfg.CaFilepath, hostname, cfg.RefreshInterval, logger)))
		}

		opts = append(opts, tlscfg.WithOverride(MaybeWithDynamicDiskKeyPair(ctx,
			cfg.CertFilepath, cfg.KeyFilepath, tlscfg.ForClient, cfg.RefreshInterval, logger)))

		tc, err := tlscfg.New(opts...)
		if err != nil {
			return nil, fmt.Errorf("cannot configure TLS for grpc client: %w", err)
		}

		grpcOpts = append(grpcOpts, grpc.WithTransportCredentials(credentials.NewTLS(tc)))
	} else {
		grpcOpts = append(grpcOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	return grpc.NewClient(addr, grpcOpts...)
}
