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
	"bytes"
	"context"
	"crypto/tls"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/tlscfg"
)

func TestMaybeWithDynamicDiskKeyPair(t *testing.T) {
	// Setup test environment
	testSetup := setupTLSTest(t)
	defer os.RemoveAll(testSetup.TmpDir)

	t.Run("empty paths return nil", func(t *testing.T) {
		ctx := context.Background()
		cfg := &tls.Config{}

		configFunc := MaybeWithDynamicDiskKeyPair(ctx, "", "", tlscfg.ForServer, 5*time.Minute, testSetup.Logger)
		err := configFunc(cfg)

		assert.NoError(t, err)
		assert.Nil(t, cfg.GetCertificate)
		assert.Nil(t, cfg.GetClientCertificate)
	})

	t.Run("server certificate is loaded", func(t *testing.T) {
		ctx := context.Background()
		cfg := &tls.Config{}

		configFunc := MaybeWithDynamicDiskKeyPair(ctx, testSetup.CertPath, testSetup.KeyPath, tlscfg.ForServer, 5*time.Minute, testSetup.Logger)
		err := configFunc(cfg)

		assert.NoError(t, err)
		assert.NotNil(t, cfg.GetCertificate)
		assert.Nil(t, cfg.GetClientCertificate)

		// Test that certificate is returned
		cert, err := cfg.GetCertificate(nil)
		assert.NoError(t, err)
		assert.NotNil(t, cert)
	})

	t.Run("client certificate is loaded", func(t *testing.T) {
		ctx := context.Background()
		cfg := &tls.Config{}

		configFunc := MaybeWithDynamicDiskKeyPair(ctx, testSetup.CertPath, testSetup.KeyPath, tlscfg.ForClient, 5*time.Minute, testSetup.Logger)
		err := configFunc(cfg)

		assert.NoError(t, err)
		assert.NotNil(t, cfg.GetClientCertificate)
		assert.Nil(t, cfg.GetCertificate)

		// Test that certificate is returned
		cert, err := cfg.GetClientCertificate(nil)
		assert.NoError(t, err)
		assert.NotNil(t, cert)
	})

	t.Run("reloads when certificate changes", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		cfg := &tls.Config{}
		shortInterval := 100 * time.Millisecond

		configFunc := MaybeWithDynamicDiskKeyPair(ctx, testSetup.CertPath, testSetup.KeyPath, tlscfg.ForServer, shortInterval, testSetup.Logger)
		err := configFunc(cfg)
		require.NoError(t, err)

		// Get initial certificate
		origCert, err := cfg.GetCertificate(nil)
		require.NoError(t, err)

		// Generate a new certificate
		newCACert, newCAKey := generateTestCACert(t)
		newServerCert, newServerKey := generateServerCert(t, "localhost", newCACert, newCAKey)

		// Replace the certificate and key files
		writeCertToPEMFile(t, testSetup.CertPath, newServerCert)
		writeKeyToPEMFile(t, testSetup.KeyPath, newServerKey)

		// Wait for reload to occur
		time.Sleep(shortInterval * 3)

		// Get new certificate
		updatedCert, err := cfg.GetCertificate(nil)
		require.NoError(t, err)

		// Verify certificates are different
		assert.False(t, compareByteSlices(origCert.Certificate, updatedCert.Certificate),
			"Certificate should have been reloaded")
	})
}

func compareByteSlices(a, b [][]byte) bool {
	if len(a) != len(b) {
		return false
	}

	for i := range a {
		if !bytes.Equal(a[i], b[i]) {
			return false
		}
	}

	return true
}
