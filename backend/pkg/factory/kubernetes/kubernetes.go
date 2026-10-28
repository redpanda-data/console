// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package kubernetes provides Kubernetes API clients for Console features that
// are backed by custom resources, such as Redpanda Connect pipelines.
package kubernetes

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/transport"
	"k8s.io/client-go/util/flowcontrol"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
)

const (
	// requestTimeout bounds every Kubernetes API call, so a hung API server
	// doesn't pin a request for as long as the browser keeps it open.
	requestTimeout = 30 * time.Second
	// The client is shared by all Console users; client-go's defaults (5/10)
	// throttle a handful of concurrent users.
	clientQPS   = 50
	clientBurst = 100
)

// ClientFactory returns Kubernetes clients authenticated for the current request.
type ClientFactory interface {
	// GetDynamicClient returns a dynamic client for the request in ctx.
	GetDynamicClient(ctx context.Context) (dynamic.Interface, error)
}

var _ ClientFactory = (*ClientProvider)(nil)

// ClientProvider authenticates either as Console's ServiceAccount or, in
// impersonateUser mode, with the logged-in user's OIDC ID token as the
// bearer token.
type ClientProvider struct {
	impersonateUser bool
	saClient        dynamic.Interface

	// userConfig keeps the API server host, CA, and limits but no Console
	// credentials. userTransport is built once from it and shared by every
	// per-user client, which only adds the user's bearer token.
	userConfig    *rest.Config
	userTransport http.RoundTripper
}

// NewClientProvider loads the in-cluster config, falling back to KUBECONFIG
// (or ~/.kube/config) for local development.
func NewClientProvider(impersonateUser bool) (*ClientProvider, error) {
	base, err := loadRESTConfig()
	if err != nil {
		return nil, err
	}
	return NewClientProviderFromConfig(base, impersonateUser)
}

// NewClientProviderFromConfig builds a ClientProvider from an explicit base
// config. base isn't modified.
func NewClientProviderFromConfig(base *rest.Config, impersonateUser bool) (*ClientProvider, error) {
	base = rest.CopyConfig(base)
	base.Timeout = requestTimeout
	base.QPS = clientQPS
	base.Burst = clientBurst
	// One limiter for all requests; otherwise each per-user client gets its own.
	base.RateLimiter = flowcontrol.NewTokenBucketRateLimiter(clientQPS, clientBurst)

	p := &ClientProvider{impersonateUser: impersonateUser}
	if !impersonateUser {
		cl, err := dynamic.NewForConfig(base)
		if err != nil {
			return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
		}
		p.saClient = cl
		return p, nil
	}

	// AnonymousClientConfig drops every Console credential (SA token, token
	// file, client certs, exec plugins, impersonation) but keeps the CA.
	p.userConfig = rest.AnonymousClientConfig(base)
	rt, err := rest.TransportFor(p.userConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes transport: %w", err)
	}
	p.userTransport = rt
	return p, nil
}

// GetDynamicClient implements ClientFactory.
func (p *ClientProvider) GetDynamicClient(ctx context.Context) (dynamic.Interface, error) {
	if !p.impersonateUser {
		return p.saClient, nil
	}
	token, ok := UserTokenFromContext(ctx)
	if !ok {
		return nil, apierrors.NewConnectError(
			connect.CodeUnauthenticated,
			errors.New("impersonateUser is enabled but no user token is available"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_NO_AUTHENTICATION_TOKEN.String()),
		)
	}
	httpClient := &http.Client{
		Transport: transport.NewBearerAuthRoundTripper(token, p.userTransport),
		Timeout:   requestTimeout,
	}
	cl, err := dynamic.NewForConfigAndClient(p.userConfig, httpClient)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}
	return cl, nil
}

func loadRESTConfig() (*rest.Config, error) {
	cfg, err := rest.InClusterConfig()
	if err == nil {
		return cfg, nil
	}
	if !errors.Is(err, rest.ErrNotInCluster) {
		return nil, fmt.Errorf("failed to load in-cluster kubernetes config: %w", err)
	}
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	cfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
	}
	return cfg, nil
}
