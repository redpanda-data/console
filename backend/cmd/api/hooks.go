package main

import (
	"context"

	"github.com/kafka-owl/kafka-owl/pkg/kafka"
)

type apiHooks struct {
	Topic TopicHooks
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

func newEmptyHooks() *apiHooks {
	empty := &emptyHooks{}
	return &apiHooks{Topic: empty}
}

func (*emptyHooks) FilterTopics(ctx context.Context, topics []*kafka.TopicDetail) {}
