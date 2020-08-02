package api

import (
	"context"

	"github.com/cloudhut/common/rest"

	"github.com/go-chi/chi"
)

// Hooks are a way to extend the Kafka Owl functionality from the outside. By default all hooks have no
// additional functionality. In order to run your own Hooks you must construct an Hooks instance and
// run attach them to your own instance of Api.
type Hooks struct {
	Route RouteHooks
	Owl   OwlHooks
}

// RouteHooks allow you to modify the Router
type RouteHooks interface {
	// ConfigAPIRouter allows you to modify the router responsible for all /api routes
	ConfigAPIRouter(router chi.Router)

	// ConfigAPIRouter allows you to modify the router responsible for all websocket routes
	ConfigWsRouter(router chi.Router)

	// ConfigRouter allows you to modify the router responsible for all non /api and non /admin routes.
	// By default we serve the frontend on these routes.
	ConfigRouter(router chi.Router)
}

// OwlHooks include all functions which allow you to modify
type OwlHooks interface {
	// Topic Hooks
	CanSeeTopic(ctx context.Context, topicName string) (bool, *rest.Error)
	CanViewTopicPartitions(ctx context.Context, topicName string) (bool, *rest.Error)
	CanViewTopicConfig(ctx context.Context, topicName string) (bool, *rest.Error)
	CanViewTopicMessages(ctx context.Context, req ListMessagesRequest) (bool, *rest.Error)
	CanUseMessageSearchFilters(ctx context.Context, req ListMessagesRequest) (bool, *rest.Error)
	CanViewTopicConsumers(ctx context.Context, topicName string) (bool, *rest.Error)
	AllowedTopicActions(ctx context.Context, topicName string) ([]string, *rest.Error)

	// ConsumerGroup Hooks
	CanSeeConsumerGroup(ctx context.Context, groupName string) (bool, *rest.Error)
	AllowedConsumerGroupActions(ctx context.Context, groupName string) ([]string, *rest.Error)
}

// defaultHooks is the default hook which is used if you don't attach your own hooks
type defaultHooks struct{}

func newDefaultHooks() *Hooks {
	d := &defaultHooks{}
	return &Hooks{
		Route: d,
		Owl:   d,
	}
}

// Router Hooks
func (*defaultHooks) ConfigAPIRouter(_ chi.Router) {}
func (*defaultHooks) ConfigWsRouter(_ chi.Router)  {}
func (*defaultHooks) ConfigRouter(_ chi.Router)    {}

// Owl Hooks
func (*defaultHooks) CanSeeTopic(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) CanViewTopicPartitions(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) CanViewTopicConfig(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) CanViewTopicMessages(_ context.Context, _ ListMessagesRequest) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) CanViewTopicConsumers(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) AllowedTopicActions(_ context.Context, _ string) ([]string, *rest.Error) {
	// "all" will be considered as wild card - all actions are allowed
	return []string{"all"}, nil
}
func (*defaultHooks) CanSeeConsumerGroup(_ context.Context, _ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) AllowedConsumerGroupActions(_ context.Context, _ string) ([]string, *rest.Error) {
	// "all" will be considered as wild card - all actions are allowed
	return []string{"all"}, nil
}
