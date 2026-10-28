// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kubernetes

import (
	"context"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/rest"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

var pipelinesGVR = schema.GroupVersionResource{Group: "cluster.redpanda.com", Version: "v1alpha2", Resource: "pipelines"}

// saConfig mimics rest.InClusterConfig plus every other credential a base config may carry.
func saConfig(host string, ca []byte) *rest.Config {
	return &rest.Config{
		Host:            host,
		BearerToken:     "sa-token",
		BearerTokenFile: "/var/run/secrets/kubernetes.io/serviceaccount/token",
		Username:        "admin",
		Password:        "secret",
		TLSClientConfig: rest.TLSClientConfig{
			CAData:   ca,
			CertData: []byte("client-cert"),
			KeyData:  []byte("client-key"),
		},
		ExecProvider: &clientcmdapi.ExecConfig{Command: "aws"},
		Impersonate:  rest.ImpersonationConfig{UserName: "system:admin"},
	}
}

// apiServer records the Authorization header of every request.
type apiServer struct {
	*httptest.Server
	mu   sync.Mutex
	auth []string
}

func newAPIServer(t *testing.T) *apiServer {
	t.Helper()
	s := &apiServer{}
	s.Server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		s.auth = append(s.auth, r.Header.Get("Authorization"))
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"apiVersion":"cluster.redpanda.com/v1alpha2","kind":"PipelineList","metadata":{},"items":[]}`))
	}))
	t.Cleanup(s.Close)
	return s
}

func (s *apiServer) caPEM() []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: s.Certificate().Raw})
}

func (s *apiServer) takeAuth() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.auth
	s.auth = nil
	return out
}

func TestUserConfigDropsConsoleCredentials(t *testing.T) {
	srv := newAPIServer(t)
	base := saConfig(srv.URL, srv.caPEM())
	p, err := NewClientProviderFromConfig(base, true)
	require.NoError(t, err)

	cfg := p.userConfig
	assert.Equal(t, srv.URL, cfg.Host)
	assert.Equal(t, srv.caPEM(), cfg.CAData)
	assert.Empty(t, cfg.BearerToken)
	assert.Empty(t, cfg.BearerTokenFile)
	assert.Empty(t, cfg.Username)
	assert.Empty(t, cfg.Password)
	assert.Empty(t, cfg.CertData)
	assert.Empty(t, cfg.KeyData)
	assert.Nil(t, cfg.ExecProvider)
	assert.Empty(t, cfg.Impersonate.UserName)
	assert.Equal(t, requestTimeout, cfg.Timeout)
	assert.NotNil(t, cfg.RateLimiter)

	assert.Equal(t, "sa-token", base.BearerToken, "the base config isn't modified")
	assert.Zero(t, base.Timeout, "the base config isn't modified")
}

func TestMissingUserTokenIsUnauthenticated(t *testing.T) {
	srv := newAPIServer(t)
	p, err := NewClientProviderFromConfig(&rest.Config{Host: srv.URL, TLSClientConfig: rest.TLSClientConfig{CAData: srv.caPEM()}}, true)
	require.NoError(t, err)

	for _, ctx := range []context.Context{context.Background(), ContextWithUserToken(context.Background(), "")} {
		_, err := p.GetDynamicClient(ctx)
		require.Error(t, err)
		assert.Equal(t, connect.CodeUnauthenticated, connect.CodeOf(err))
		assert.Contains(t, err.Error(), "impersonateUser is enabled but no user token is available")
	}
}

// TestAuthorizationOnTheWire checks the Authorization header the API server sees.
func TestAuthorizationOnTheWire(t *testing.T) {
	srv := newAPIServer(t)
	base := &rest.Config{Host: srv.URL, BearerToken: "sa-token", TLSClientConfig: rest.TLSClientConfig{CAData: srv.caPEM()}}

	list := func(t *testing.T, p *ClientProvider, token string) {
		t.Helper()
		cl, err := p.GetDynamicClient(ContextWithUserToken(context.Background(), token))
		require.NoError(t, err)
		_, err = cl.Resource(pipelinesGVR).Namespace("ns").List(context.Background(), metav1.ListOptions{})
		require.NoError(t, err)
	}

	t.Run("service account", func(t *testing.T) {
		p, err := NewClientProviderFromConfig(base, false)
		require.NoError(t, err)
		list(t, p, "user-id-token")
		assert.Equal(t, []string{"Bearer sa-token"}, srv.takeAuth())
	})

	t.Run("impersonate user sends only each user's token", func(t *testing.T) {
		p, err := NewClientProviderFromConfig(base, true)
		require.NoError(t, err)
		list(t, p, "alice-token")
		list(t, p, "bob-token")
		list(t, p, "alice-token")
		assert.Equal(t, []string{"Bearer alice-token", "Bearer bob-token", "Bearer alice-token"}, srv.takeAuth())
	})
}
