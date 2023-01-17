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

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

// Hooks are a way to extend the Console functionality from the outside. By default, all hooks have no
// additional functionality. In order to run your own Hooks you must construct a Hooks instance and
// run attach them to your own instance of Api.
type Hooks struct {
	Route   RouteHooks
	Console ConsoleHooks
}

// RouteHooks allow you to modify the Router
type RouteHooks interface {
	// ConfigAPIRouter allows you to modify the router responsible for all /api routes
	ConfigAPIRouter(router chi.Router)

	// ConfigWsRouter allows you to modify the router responsible for all websocket routes
	ConfigWsRouter(router chi.Router)

	// ConfigInternalRouter allows you to modify the router responsible for all internal /admin/* routes
	ConfigInternalRouter(router chi.Router)

	// ConfigRouter allows you to modify the router responsible for all non /api and non /admin routes.
	// By default we serve the frontend on these routes.
	ConfigRouter(router chi.Router)
}

// ConsoleHooks include all functions which allow you to intercept the requests at various
// endpoints where RBAC rules may be applied.
type ConsoleHooks interface {
	// Topic Hooks
	CanSeeTopic(ctx context.Context, topicName string) (bool, *rest.Error)
	CanCreateTopic(ctx context.Context, topicName string) (bool, *rest.Error)
	CanEditTopicConfig(ctx context.Context, topicName string) (bool, *rest.Error)
	CanDeleteTopic(ctx context.Context, topicName string) (bool, *rest.Error)
	CanPublishTopicRecords(ctx context.Context, topicName string) (bool, *rest.Error)
	CanDeleteTopicRecords(ctx context.Context, topicName string) (bool, *rest.Error)
	CanViewTopicPartitions(ctx context.Context, topicName string) (bool, *rest.Error)
	CanViewTopicConfig(ctx context.Context, topicName string) (bool, *rest.Error)
	CanViewTopicMessages(ctx context.Context, req *ListMessagesRequest) (bool, *rest.Error)
	CanUseMessageSearchFilters(ctx context.Context, req *ListMessagesRequest) (bool, *rest.Error)
	CanViewTopicConsumers(ctx context.Context, topicName string) (bool, *rest.Error)
	AllowedTopicActions(ctx context.Context, topicName string) ([]string, *rest.Error)
	PrintListMessagesAuditLog(r *http.Request, req *console.ListMessageRequest)

	// ACL Hooks
	CanListACLs(ctx context.Context) (bool, *rest.Error)
	CanCreateACL(ctx context.Context) (bool, *rest.Error)
	CanDeleteACL(ctx context.Context) (bool, *rest.Error)

	// Quotas Hookas
	CanListQuotas(ctx context.Context) (bool, *rest.Error)

	// ConsumerGroup Hooks
	CanSeeConsumerGroup(ctx context.Context, groupName string) (bool, *rest.Error)
	CanEditConsumerGroup(ctx context.Context, groupName string) (bool, *rest.Error)
	CanDeleteConsumerGroup(ctx context.Context, groupName string) (bool, *rest.Error)
	AllowedConsumerGroupActions(ctx context.Context, groupName string) ([]string, *rest.Error)

	// Operations Hooks
	CanPatchPartitionReassignments(ctx context.Context) (bool, *rest.Error)
	CanPatchConfigs(ctx context.Context) (bool, *rest.Error)

	// Kafka Connect Hooks
	CanViewConnectCluster(ctx context.Context, clusterName string) (bool, *rest.Error)
	CanEditConnectCluster(ctx context.Context, clusterName string) (bool, *rest.Error)
	CanDeleteConnectCluster(ctx context.Context, clusterName string) (bool, *rest.Error)
	AllowedConnectClusterActions(ctx context.Context, clusterName string) ([]string, *rest.Error)

	// Kafka User Hooks
	CanListKafkaUsers(ctx context.Context) (bool, *rest.Error)
	CanCreateKafkaUsers(ctx context.Context) (bool, *rest.Error)
	CanDeleteKafkaUsers(ctx context.Context) (bool, *rest.Error)
	IsProtectedKafkaUser(userName string) bool

	// Console Hooks
	// ConsoleLicenseInformation returns the license information for Console.
	// Based on the returned license the frontend will display the
	// appropriate UI and also warnings if the license is (about to be) expired.
	ConsoleLicenseInformation(ctx context.Context) redpanda.License

	// EnabledFeatures returns a list of string enums that indicate what features are enabled.
	// Only toggleable features that require conditional rendering in the Frontend will be returned.
	// The information will be baked into the index.html so that the Frontend knows about it
	// at startup, which might be important to not block rendering (e.g. SSO enabled -> render login).
	EnabledFeatures() []string
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
func (*defaultHooks) ConfigAPIRouter(_ chi.Router)      {}
func (*defaultHooks) ConfigWsRouter(_ chi.Router)       {}
func (*defaultHooks) ConfigInternalRouter(_ chi.Router) {}
func (*defaultHooks) ConfigRouter(_ chi.Router)         {}

// Console Hooks
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

func (*defaultHooks) CanViewTopicMessages(_ context.Context, _ *ListMessagesRequest) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanUseMessageSearchFilters(_ context.Context, _ *ListMessagesRequest) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) CanViewTopicConsumers(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}

func (*defaultHooks) AllowedTopicActions(_ context.Context, _ string) ([]string, *rest.Error) {
	// "all" will be considered as wild card - all actions are allowed
	return []string{"all"}, nil
}
func (*defaultHooks) PrintListMessagesAuditLog(_ *http.Request, _ *console.ListMessageRequest) {}
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

func (*defaultHooks) ConsoleLicenseInformation(_ context.Context) redpanda.License {
	return redpanda.License{Source: redpanda.LicenseSourceConsole, Type: redpanda.LicenseTypeOpenSource, ExpiresAt: math.MaxInt32}
}

func (*defaultHooks) EnabledFeatures() []string {
	return []string{}
}
