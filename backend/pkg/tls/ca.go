// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package tls

import (
	"context"
	"crypto/sha256"
	libtls "crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync/atomic"
	"time"
)

// MaybeWithDynamicClientCA returns a function that configures a CA on the tls
// Config reading it from a file and updating whenever its content changes.
// It is intended to be used on a client configuration to set the server CA it
// expects to talk to.
//
// Asynchronous reloading is triggered when a new request is served, not before
// 5 minutes from last reload.
func MaybeWithDynamicClientCA(
	quitCtx context.Context,
	caPath string,
	hostname string,
	refreshInterval time.Duration,
	logger *slog.Logger,
) func(*libtls.Config) error {
	return func(cfg *libtls.Config) error {
		if caPath == "" {
			return nil
		}

		r, err := newCAReloader(quitCtx, cfg, caPath, refreshInterval, logger)
		if err != nil {
			return err
		}
		// There's no direct client-side equivalent to GetConfigForClient;
		// instead, we skip the standard server certificate validation and
		// override VerifyConnection instead.
		if !cfg.InsecureSkipVerify {
			cfg.InsecureSkipVerify = true
			cfg.VerifyConnection = func(s libtls.ConnectionState) error {
				root := r.tc.Load()
				pool := root.ClientCAs
				leaf := s.PeerCertificates[0]
				_, err := leaf.Verify(x509.VerifyOptions{
					DNSName: hostname,
					Roots:   pool,
				})
				return err
			}
		}
		return nil
	}
}

type caReloader struct {
	tc     atomic.Pointer[libtls.Config]
	digest [sha256.Size]byte

	caPath string
	logger *slog.Logger
}

func newCAReloader(quitCtx context.Context, initCfg *libtls.Config, caPath string, refreshInterval time.Duration,
	logger *slog.Logger,
) (*caReloader, error) {
	r := caReloader{
		caPath: caPath,
		logger: logger,
	}
	r.tc.Store(initCfg)
	if err := r.load(); err != nil {
		return nil, err
	}
	go r.reloader(quitCtx, refreshInterval)
	return &r, nil
}

func (r *caReloader) reloader(quitCtx context.Context, refreshInterval time.Duration) {
	ticker := time.NewTicker(refreshInterval)
	defer ticker.Stop()

	for {
		select {
		case <-quitCtx.Done():
			return
		case <-ticker.C:
			if err := r.load(); err != nil {
				r.logger.ErrorContext(quitCtx, "error while reloading the CA", slog.Any("error", err))
			}
		}
	}
}

func (r *caReloader) load() error {
	ca, err := os.ReadFile(r.caPath)
	if err != nil {
		return fmt.Errorf("cannot read CA file %q: %w", r.caPath, err)
	}
	digest := sha256.Sum256(ca)
	if digest == r.digest {
		r.logger.Debug("CA cert did not change", slog.String("path", r.caPath))
		return nil
	}
	cfg := r.tc.Load().Clone()
	if cfg.ClientCAs == nil {
		cfg.ClientCAs = x509.NewCertPool()
	}
	if !cfg.ClientCAs.AppendCertsFromPEM(ca) {
		return errors.New("some CA certificates were not parsed correctly")
	}
	// CA changed. We constantly append to the old CA cert list, with the
	// assumption that CA rotation is rare enough that we will restart
	// before the list is problematic.
	r.logger.Info("loaded new CA cert from disk and added to pool",
		slog.String("ca_path", r.caPath),
		slog.String("ca_digest", fmt.Sprintf("%x", digest)),
	)
	r.tc.Store(cfg)
	r.digest = digest
	return nil
}
