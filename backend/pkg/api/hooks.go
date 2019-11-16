package api

import (
	"context"

	"github.com/go-chi/chi"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
)

// Hooks are a way to extend the Kafka Owl functionality from the outside. By default all hooks have no
// additional functionality. In order to run your own Hooks you must construct an Hooks instance and
// run your own instance of api.
type Hooks struct {
	Route RouteHooks
	Topic TopicHooks
}

// RouteHooks -
type RouteHooks interface {
	ConfigAPIRouter(router chi.Router)
	ConfigFrontendRouter(router chi.Router)
}

// TopicHooks -
type TopicHooks interface {
	FilterTopics(ctx context.Context, topics []*kafka.TopicDetail)
}

// Empty Hooks
type emptyHooks struct {
}

func newEmptyHooks() *Hooks {
	empty := &emptyHooks{}
	return &Hooks{
		Route: empty,
		Topic: empty,
	}
}

// Route
func (*emptyHooks) ConfigPublicRouter(router chi.Router)   {}
func (*emptyHooks) ConfigAPIRouter(router chi.Router)      {}
func (*emptyHooks) ConfigFrontendRouter(router chi.Router) {}

// Topic
func (*emptyHooks) FilterTopics(ctx context.Context, topics []*kafka.TopicDetail) {}
