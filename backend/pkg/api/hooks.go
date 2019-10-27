package api

import (
	"context"
	"net/http"

	"github.com/kafka-owl/kafka-owl/pkg/kafka"
)

// Hooks -
type Hooks struct {
	Route RouteHooks
	Topic TopicHooks
}

// RouteHooks -
type RouteHooks interface {
	RegisterHandler(pattern string, h http.Handler) (string, http.Handler)
	RegisterFunc(pattern string, h http.HandlerFunc) (string, http.HandlerFunc)
}

// TopicHooks -
type TopicHooks interface {
	FilterTopics(ctx context.Context, topics []*kafka.TopicDetail)
}

//
// Empty Hooks
//
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
func (*emptyHooks) RegisterHandler(pattern string, h http.Handler) (string, http.Handler) {
	return pattern, h
}
func (*emptyHooks) RegisterFunc(pattern string, h http.HandlerFunc) (string, http.HandlerFunc) {
	return pattern, h
}

// Topic
func (*emptyHooks) FilterTopics(ctx context.Context, topics []*kafka.TopicDetail) {}
