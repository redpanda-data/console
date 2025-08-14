// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"context"
	"errors"
	"math"
	"net/http"

	"connectrpc.com/connect"
	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"

	"github.com/redpanda-data/console/backend/pkg/api/httptypes"
	pkgconnect "github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/license"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

// Hooks are a way to extend the Console functionality from the outside. By default, all hooks have no
// additional functionality. In order to run your own Hooks you must construct a Hooks instance and
// run attach them to your own instance of Api.
type Hooks struct {
	Route   RouteHooks
	Console ConsoleHooks
}

// ConfigConnectRPCRequest is the config object that is passed into the
// hook to configure the Connect API. The hook implementation can use
// this to control the behaviour of the connect API (e.g. change order,
// add additional interceptors, mount more routes etc).
type ConfigConnectRPCRequest struct {
	BaseInterceptors []connect.Interceptor
	GRPCGatewayMux   *runtime.ServeMux
	Services         map[string]any
}

// ConfigConnectRPCResponse configures connect services.
type ConfigConnectRPCResponse struct {
	// Instructs OSS to use these intercptors for all connect services
	Interceptors []connect.Interceptor

	// HTTPMiddlewares are middlewares that shall be used for the router
	// that serves all ConnectRPC requests.
	HTTPMiddlewares []func(http.Handler) http.Handler

	// Original, possibly mutated, services
	Services map[string]any

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
	EndpointCompatibility(ctx context.Context) []console.EndpointCompatibilityEndpoint
}

// defaultHooks is the default hook which is used if you don't attach your own hooks
type defaultHooks struct{}

func newDefaultHooks() *Hooks {
	d := &defaultHooks{}
	return &Hooks{
		Route:   d,
		Console: d,
	}
}

// Router Hooks
func (*defaultHooks) ConfigAPIRouter(_ chi.Router)                 {}
func (*defaultHooks) ConfigAPIRouterPostRegistration(_ chi.Router) {}
func (*defaultHooks) ConfigInternalRouter(_ chi.Router)            {}
func (*defaultHooks) ConfigRouter(_ chi.Router)                    {}
func (*defaultHooks) ConfigGRPCGateway(_ *runtime.ServeMux)        {}
func (*defaultHooks) InitConnectRPCRouter(_ chi.Router)            {}
func (*defaultHooks) ConfigConnectRPC(req ConfigConnectRPCRequest) ConfigConnectRPCResponse {
	return ConfigConnectRPCResponse{
		Interceptors:       req.BaseInterceptors,
		AdditionalServices: []ConnectService{},
		Services:           req.Services,
	}
}

// Console hooks
func (*defaultHooks) ConsoleLicenseInformation(_ context.Context) license.License {
	return license.License{Source: license.SourceConsole, Type: license.TypeOpenSource, ExpiresAt: math.MaxInt32, Organization: ""}
}

func (*defaultHooks) EnabledFeatures() []string {
	return []string{}
}

func (*defaultHooks) EndpointCompatibility(context.Context) []console.EndpointCompatibilityEndpoint {
	return nil
}

func (*defaultHooks) CheckWebsocketConnection(r *http.Request, _ httptypes.ListMessagesRequest) (context.Context, error) {
	return r.Context(), nil
}

func (*defaultHooks) EnabledConnectClusterFeatures(_ context.Context, _ string) []pkgconnect.ClusterFeature {
	return nil
}

func (*defaultHooks) CanListRedpandaRoles(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanCreateRedpandaRoles(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteRedpandaRoles(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

var _ consolev1alpha1connect.AuthenticationServiceHandler = (*AuthenticationDefaultHandler)(nil)

// AuthenticationDefaultHandler implements important methods for authentication, which is
// a Console enterprise feature. Because we only have one frontend for OSS and Enterprise
// we need to provide some default implementation and API responses, which we'll do with
// this handler.
type AuthenticationDefaultHandler struct{}

// ListAuthenticationMethods provides a valid response and informs the frontend, that no
// authentication is active. Based on that information the login page is hidden.
func (*AuthenticationDefaultHandler) ListAuthenticationMethods(context.Context, *connect.Request[v1alpha1.ListAuthenticationMethodsRequest]) (*connect.Response[v1alpha1.ListAuthenticationMethodsResponse], error) {
	res := &v1alpha1.ListAuthenticationMethodsResponse{
		Methods: []v1alpha1.AuthenticationMethod{v1alpha1.AuthenticationMethod_AUTHENTICATION_METHOD_NONE},
	}
	return connect.NewResponse(res), nil
}

// LoginSaslScram is implemented in the enterprise code base only.
func (*AuthenticationDefaultHandler) LoginSaslScram(context.Context, *connect.Request[v1alpha1.LoginSaslScramRequest]) (*connect.Response[v1alpha1.LoginSaslScramResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("authentication service requires an enterprise license"))
}

// GetIdentity defaults all permissions by default. That informs the frontend to unlock
// all buttons etc. The actual permission check happens inside the enterprise code base.
func (*AuthenticationDefaultHandler) GetIdentity(context.Context, *connect.Request[v1alpha1.GetIdentityRequest]) (*connect.Response[v1alpha1.GetIdentityResponse], error) {
	res := &v1alpha1.GetIdentityResponse{
		DisplayName:          "",
		AuthenticationMethod: v1alpha1.AuthenticationMethod_AUTHENTICATION_METHOD_NONE,
		AvatarUrl:            "",
		Permissions: &v1alpha1.GetIdentityResponse_Permissions{
			KafkaClusterOperations: GetAllKafkaACLOperations(),
			SchemaRegistry:         GetAllSchemaRegistryCapabilities(),
			Redpanda:               GetAllRedpandaCapabilities(),
		},
	}
	return connect.NewResponse(res), nil
}

// GetAllRedpandaCapabilities returns a slice containing all defined
// RedpandaCapability enum values, except for the unspecified value (0).
// It leverages the protobuf reflection API to dynamically iterate over
// the enum descriptors, ensuring that any new values added in the proto
// file are automatically included.
func GetAllRedpandaCapabilities() []v1alpha1.RedpandaCapability {
	enumDesc := v1alpha1.RedpandaCapability(0).Descriptor()
	values := enumDesc.Values()
	capabilities := make([]v1alpha1.RedpandaCapability, 0, values.Len())

	for i := 0; i < values.Len(); i++ {
		capNum := values.Get(i).Number()
		// Skip the unspecified value (0).
		if capNum == 0 {
			continue
		}
		capabilities = append(capabilities, v1alpha1.RedpandaCapability(capNum))
	}
	return capabilities
}

// GetAllKafkaACLOperations returns a slice containing all defined
// KafkaAclOperation enum values, except for the unspecified value (0).
// It leverages the protobuf reflection API to dynamically iterate over
// the enum descriptors, ensuring that any new values added in the proto
// file are automatically included.
func GetAllKafkaACLOperations() []v1alpha1.KafkaAclOperation {
	enumDesc := v1alpha1.KafkaAclOperation(0).Descriptor()
	values := enumDesc.Values()
	operations := make([]v1alpha1.KafkaAclOperation, 0, values.Len())

	for i := 0; i < values.Len(); i++ {
		num := values.Get(i).Number()
		if num == 0 {
			continue
		}
		operations = append(operations, v1alpha1.KafkaAclOperation(num))
	}
	return operations
}

// GetAllSchemaRegistryCapabilities returns a slice containing all defined
// SchemaRegistryCapability enum values, except for the unspecified value (0).
// It leverages the protobuf reflection API to dynamically iterate over
// the enum descriptors, ensuring that any new values added in the proto
// file are automatically included.
func GetAllSchemaRegistryCapabilities() []v1alpha1.SchemaRegistryCapability {
	enumDesc := v1alpha1.SchemaRegistryCapability(0).Descriptor()
	values := enumDesc.Values()
	capabilities := make([]v1alpha1.SchemaRegistryCapability, 0, values.Len())

	for i := 0; i < values.Len(); i++ {
		num := values.Get(i).Number()
		if num == 0 {
			continue
		}
		capabilities = append(capabilities, v1alpha1.SchemaRegistryCapability(num))
	}
	return capabilities
}

// ListConsoleUsers is implemented in the enterprise code base only.
func (*AuthenticationDefaultHandler) ListConsoleUsers(context.Context, *connect.Request[v1alpha1.ListConsoleUsersRequest]) (*connect.Response[v1alpha1.ListConsoleUsersResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("authentication service requires an enterprise license"))
}
