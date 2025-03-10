// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package hooks contains the interface definitions of different hooks
package hooks

import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	"github.com/go-chi/chi/v5"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"

	pkgconnect "github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/license"
)

// ConfigConnectRPCRequest is the config object that is passed into the
// hook to configure the Connect API. The hook implementation can use
// this to control the behaviour of the connect API (e.g. change order,
// add additional interceptors, mount more routes etc).
type ConfigConnectRPCRequest struct {
	BaseInterceptors []connect.Interceptor
	GRPCGatewayMux   *runtime.ServeMux
}

// ConfigConnectRPCResponse configures connect services.
type ConfigConnectRPCResponse struct {
	// Instructs OSS to use these intercptors for all connect services
	Interceptors []connect.Interceptor

	// Instructs OSS to register these services in addition to the OSS ones
	AdditionalServices []ConnectService
}

// ConnectService is a Connect handler along with its metadata
// that is required to mount the service in the mux as well
// as advertise it in the gRPC reflector.
type ConnectService struct {
	ServiceName string
	MountPath   string
	Handler     http.Handler
}

// RouteHooks allow you to modify the Router
type RouteHooks interface {
	// ConfigAPIRouter allows you to modify the router responsible for all /api routes
	ConfigAPIRouter(router chi.Router)

	// ConfigAPIRouterPostRegistration allows you to modify the router responsible for
	// all /api routes after all routes have been registered.
	ConfigAPIRouterPostRegistration(router chi.Router)

	// ConfigInternalRouter allows you to modify the router responsible for all internal /admin/* routes
	ConfigInternalRouter(router chi.Router)

	// ConfigRouter allows you to modify the router responsible for all non /api and non /admin routes.
	// By default we serve the frontend on these routes.
	ConfigRouter(router chi.Router)

	// ConfigConnectRPC receives the basic interceptors used by OSS.
	// The hook can modify the interceptors slice, i.e. adding new interceptors, removing some, re-ordering, and return it in ConnectConfig.
	// The hook can return additional connect services that shall be mounted by OSS.
	ConfigConnectRPC(ConfigConnectRPCRequest) ConfigConnectRPCResponse

	// InitConnectRPCRouter is used to initialize the ConnectRPC router with any top level middleware.
	InitConnectRPCRouter(router chi.Router)
}

// ConsoleHooks are hooks for providing additional context to the Frontend where needed.
// This could be information about what license is used, what enterprise features are
// enabled etc.
type ConsoleHooks interface {
	// ConsoleLicenseInformation returns the license information for Console.
	// Based on the returned license the frontend will display the
	// appropriate UI and also warnings if the license is (about to be) expired.
	ConsoleLicenseInformation(ctx context.Context) license.License

	// EnabledFeatures returns a list of string enums that indicate what features are enabled.
	// Only toggleable features that require conditional rendering in the Frontend will be returned.
	// The information will be baked into the index.html so that the Frontend knows about it
	// at startup, which might be important to not block rendering (e.g. SSO enabled -> render login).
	EnabledFeatures() []string

	// EnabledConnectClusterFeatures returns a list of features that are supported on this
	// particular Kafka connect cluster.
	EnabledConnectClusterFeatures(ctx context.Context, clusterName string) []pkgconnect.ClusterFeature

	// EndpointCompatibility returns information what endpoints are available to the frontend.
	// This considers the active configuration (e.g. is secret store enabled), target cluster
	// version and what features are supported by our upstream systems.
	// The response of this hook will be merged into the response that was originally
	// composed by Console.
	EndpointCompatibility() []console.EndpointCompatibilityEndpoint
}
