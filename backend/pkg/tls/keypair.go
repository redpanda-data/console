// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package tls contains tools to deal with TLS certificates.
package tls

import (
	"context"
	"crypto/sha256"
	libtls "crypto/tls"
	"fmt"
	"os"
	"sync/atomic"
	"time"

	"github.com/twmb/tlscfg"
	"go.uber.org/zap"
)

// MaybeWithDynamicDiskKeyPair returns a function that configures a certificate
// on the tls Config that is read from a pair of files on disk and updated
// whenever the content of those files changes.
//
// The context is used to cancel the background reloader goroutine.
func MaybeWithDynamicDiskKeyPair(
	ctx context.Context,
	certPath string,
	keyPath string,
	forKind tlscfg.ForKind,
	refreshInterval time.Duration,
	logger *zap.Logger,
) func(*libtls.Config) error {
	return func(cfg *libtls.Config) error {
		if certPath == "" && keyPath == "" {
			return nil
		}

		r, err := newKeyPairReloader(ctx, certPath, keyPath, refreshInterval, logger)
		if err != nil {
			return err
		}
		switch forKind {
		case tlscfg.ForServer:
			cfg.GetCertificate = func(_ *libtls.ClientHelloInfo) (*libtls.Certificate, error) {
				return r.cert.Load(), nil
			}
		case tlscfg.ForClient:
			cfg.GetClientCertificate = func(_ *libtls.CertificateRequestInfo) (*libtls.Certificate, error) {
				return r.cert.Load(), nil
			}
		}
		return nil
	}
}

type keyPairReloader struct {
	cert   atomic.Pointer[libtls.Certificate]
	digest [sha256.Size]byte

	certPath   string
	keyPath    string
	reloadTime time.Duration
	logger     *zap.Logger
}

func newKeyPairReloader(ctx context.Context, certPath, keyPath string, refreshInterval time.Duration, logger *zap.Logger) (*keyPairReloader, error) {
	r := keyPairReloader{
		certPath:   certPath,
		keyPath:    keyPath,
		logger:     logger,
		reloadTime: refreshInterval,
	}
	if err := r.load(); err != nil {
		return nil, err
	}
	go r.reloader(ctx)
	return &r, nil
}

func (r *keyPairReloader) reloader(ctx context.Context) {
	ticker := time.NewTicker(r.reloadTime)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("stopped TLS keypair reloader", zap.String("reason", "context cancelled"))
			return
		case <-ticker.C:
			if err := r.load(); err != nil {
				r.logger.Error("error while reloading the certificate key pair", zap.Any("err", err))
			}
		}
	}
}

func (r *keyPairReloader) load() error {
	cert, err := os.ReadFile(r.certPath)
	if err != nil {
		return fmt.Errorf("cannot read cert file %q: %w", r.certPath, err)
	}
	key, err := os.ReadFile(r.keyPath)
	if err != nil {
		return fmt.Errorf("cannot read key file %q: %w", r.keyPath, err)
	}
	id1 := sha256.Sum256(cert)
	id2 := sha256.Sum256(key)
	digest := sha256.Sum256(append(id1[:], id2[:]...))
	if digest == r.digest {
		r.logger.Debug("TLS key pair did not change", zap.String("certPath", r.certPath), zap.String("keyPath", r.keyPath))
		return nil
	}
	kp, err := libtls.X509KeyPair(cert, key)
	if err != nil {
		return fmt.Errorf("cannot create key pair: %w", err)
	}
	r.logger.Info("loaded new TLS key pair from disk",
		zap.String("certPath", r.certPath),
		zap.String("keyPath", r.keyPath),
		zap.String("combinedDigest", fmt.Sprintf("%x", digest)),
	)
	r.cert.Store(&kp)
	r.digest = digest
	return nil
}
