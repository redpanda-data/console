// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package rest provides the deserialization logic for REST encoded
// payloads.
package rest

import (
	"regexp"

	"github.com/redpanda-data/console/backend/pkg/config"
)

type RestTopic struct {
	TopicExpr *regexp.Regexp
	Url       string
}

// Service represents REST Serde cfg, topic name regexes.
type Service struct {
	cfg    config.RestSerde
	Topics []*RestTopic
}

// NewService returns a new instance of Service with compiled regexes.
func NewService(cfg config.RestSerde) (*Service, error) {
	topics := make([]*RestTopic, len(cfg.Topics))
	for i, rt := range cfg.Topics {
		expr, _ := config.CompileRegex(rt.Name)
		topics[i] = &RestTopic{
			TopicExpr: expr,
			Url:       rt.Url,
		}
	}

	return &Service{
		cfg:    cfg,
		Topics: topics,
	}, nil
}

func (s *Service) GetRestTopic(topicName string) *RestTopic {
	if !s.cfg.Enabled {
		return nil
	}

	for _, topic := range s.Topics {
		if topic.TopicExpr.MatchString(topicName) {
			return topic
		}
	}

	return nil
}
