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
	"math"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"

	"github.com/redpanda-data/console/backend/pkg/api/hooks"
	"github.com/redpanda-data/console/backend/pkg/api/httptypes"
	pkgconnect "github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

// Hooks are a way to extend the Console functionality from the outside. By default, all hooks have no
// additional functionality. In order to run your own Hooks you must construct a Hooks instance and
// run attach them to your own instance of Api.
type Hooks struct {
	Route         hooks.RouteHooks
	Authorization hooks.AuthorizationHooks
	Console       hooks.ConsoleHooks
}

// defaultHooks is the default hook which is used if you don't attach your own hooks
type defaultHooks struct{}

func newDefaultHooks() *Hooks {
	d := &defaultHooks{}
	return &Hooks{
		Authorization: d,
		Route:         d,
		Console:       d,
	}
}

// Router Hooks
func (*defaultHooks) ConfigAPIRouter(_ chi.Router)                 {}
func (*defaultHooks) ConfigAPIRouterPostRegistration(_ chi.Router) {}
func (*defaultHooks) ConfigWsRouter(_ chi.Router)                  {}
func (*defaultHooks) ConfigInternalRouter(_ chi.Router)            {}
func (*defaultHooks) ConfigRouter(_ chi.Router)                    {}
func (*defaultHooks) ConfigGRPCGateway(_ *runtime.ServeMux)        {}
func (*defaultHooks) ConfigConnectRPC(req hooks.ConfigConnectRPCRequest) hooks.ConfigConnectRPCResponse {
	return hooks.ConfigConnectRPCResponse{
		Interceptors:       req.BaseInterceptors,
		AdditionalServices: []hooks.ConnectService{},
	}
}

// Authorization Hooks
func (*defaultHooks) CanSeeTopic(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanCreateTopic(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanEditTopicConfig(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteTopic(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanPublishTopicRecords(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteTopicRecords(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanViewTopicPartitions(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanViewTopicConfig(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanViewTopicMessages(_ context.Context, _ *httptypes.ListMessagesRequest) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanUseMessageSearchFilters(_ context.Context, _ *httptypes.ListMessagesRequest) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanViewTopicConsumers(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) AllowedTopicActions(_ context.Context, _ string) ([]string, *rest.Error) {
	// "all" will be considered as wild card - all actions are allowed
	return []string{"all"}, nil
}

func (*defaultHooks) PrintListMessagesAuditLog(_ context.Context, _ any, _ *console.ListMessageRequest) {
}

func (*defaultHooks) CanListACLs(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanCreateACL(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteACL(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanListQuotas(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanSeeConsumerGroup(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanEditConsumerGroup(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteConsumerGroup(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) AllowedConsumerGroupActions(_ context.Context, _ string) ([]string, *rest.Error) {
	// "all" will be considered as wild card - all actions are allowed
	return []string{"all"}, nil
}

func (*defaultHooks) CanPatchPartitionReassignments(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanPatchConfigs(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanViewConnectCluster(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanEditConnectCluster(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteConnectCluster(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) AllowedConnectClusterActions(_ context.Context, _ string) ([]string, *rest.Error) {
	// "all" will be considered as wild card - all actions are allowed
	return []string{"all"}, nil
}

func (*defaultHooks) CanListKafkaUsers(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanCreateKafkaUsers(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteKafkaUsers(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) IsProtectedKafkaUser(_ string) bool {
	return false
}

func (*defaultHooks) CanViewSchemas(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanCreateSchemas(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanDeleteSchemas(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanManageSchemaRegistry(_ context.Context) (bool, *rest.Error) {
	return true, nil
}

// Console hooks
func (*defaultHooks) ConsoleLicenseInformation(_ context.Context) redpanda.License {
	return redpanda.License{Source: redpanda.LicenseSourceConsole, Type: redpanda.LicenseTypeOpenSource, ExpiresAt: math.MaxInt32}
}

func (*defaultHooks) EnabledFeatures() []string {
	return []string{}
}

func (*defaultHooks) EndpointCompatibility() []console.EndpointCompatibilityEndpoint {
	return nil
}

func (*defaultHooks) CheckWebsocketConnection(r *http.Request, _ httptypes.ListMessagesRequest) (context.Context, error) {
	return r.Context(), nil
}

func (*defaultHooks) EnabledConnectClusterFeatures(_ context.Context, _ string) []pkgconnect.ClusterFeature {
	return nil
}
