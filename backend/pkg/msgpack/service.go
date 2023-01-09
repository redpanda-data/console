// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package msgpack provides the deserialization logic for MessagePack encoded
// payloads.
package msgpack

import (
	"regexp"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// Service represents messagepack cfg, topic name regexes.
type Service struct {
	cfg config.Msgpack

	AllowedTopicsExpr []*regexp.Regexp
}

// NewService returns a new instance of Service with compiled regexes.
func NewService(cfg config.Msgpack) (*Service, error) {
	allowedTopicsExpr, err := config.CompileRegexes(cfg.TopicNames)
	if err != nil {
		return nil, err
	}

	return &Service{
		cfg:               cfg,
		AllowedTopicsExpr: allowedTopicsExpr,
	}, nil
}

// IsTopicAllowed validates if a topicName is permitted as per the config regexes.
func (s *Service) IsTopicAllowed(topicName string) bool {
	isAllowed := false
	for _, regex := range s.AllowedTopicsExpr {
		if regex.MatchString(topicName) {
			isAllowed = true
			break
		}
	}

	return isAllowed
}
