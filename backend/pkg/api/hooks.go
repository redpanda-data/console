package api

import (
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

	// ConfigRouter allows you to modify the router responsible for all non /api and non /admin routes.
	// By default we serve the frontend on these routes.
	ConfigRouter(router chi.Router)
}

// OwlHooks include all functions which allow you to modify
type OwlHooks interface {
	CanSeeTopic(topicName string) (bool, *rest.Error)
	CanViewTopicPartitions(topicName string) (bool, *rest.Error)
	CanViewTopicConfig(topicName string) (bool, *rest.Error)
	CanViewTopicMessages(topicName string) (bool, *rest.Error)
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
func (*defaultHooks) ConfigRouter(_ chi.Router)    {}

// Owl Hooks
func (*defaultHooks) CanSeeTopic(_ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) CanViewTopicPartitions(_ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) CanViewTopicConfig(_ string) (bool, *rest.Error) {
	return true, nil
}
func (*defaultHooks) CanViewTopicMessages(_ string) (bool, *rest.Error) {
	return true, nil
}
