// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package topic contains all handlers for the topic endpoints.
package topic

import (
	"context"
	"net/http"
	"strconv"

	"connectrpc.com/connect"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ dataplanev1alpha1connect.TopicServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	targetService dataplanev1alpha2connect.TopicServiceHandler
	mapper        apiVersionMapper
	defaulter     defaulter
}

// NewService creates a new user service handler.
func NewService(targetService dataplanev1alpha2connect.TopicServiceHandler) *Service {
	return &Service{
		targetService: targetService,
		mapper:        apiVersionMapper{},
		defaulter:     defaulter{},
	}
}

// ListTopics lists all Kafka topics with their most important metadata.
func (s *Service) ListTopics(ctx context.Context, req *connect.Request[v1alpha1.ListTopicsRequest]) (*connect.Response[v1alpha1.ListTopicsResponse], error) {
	s.defaulter.applyListTopicsRequest(req.Msg)

	pr := s.mapper.v1alpha1ToListTopicsv1alpha2(req.Msg)

	resp, err := s.targetService.ListTopics(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	topics := s.mapper.v1alpha2ListTopicsResponseTov1alpha1(resp.Msg.GetTopics())

	return connect.NewResponse(&v1alpha1.ListTopicsResponse{Topics: topics, NextPageToken: resp.Msg.NextPageToken}), nil
}

// DeleteTopic deletes a Kafka topic.
func (s *Service) DeleteTopic(ctx context.Context, req *connect.Request[v1alpha1.DeleteTopicRequest]) (*connect.Response[v1alpha1.DeleteTopicResponse], error) {
	pr := s.mapper.v1alpha1ToDeleteTopicv1alpha2(req.Msg)

	_, err := s.targetService.DeleteTopic(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	connectResponse := connect.NewResponse(&v1alpha1.DeleteTopicResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}

// GetTopicConfigurations retrieves a topic's configuration.
func (s *Service) GetTopicConfigurations(ctx context.Context, req *connect.Request[v1alpha1.GetTopicConfigurationsRequest]) (*connect.Response[v1alpha1.GetTopicConfigurationsResponse], error) {
	pr := s.mapper.v1alpha1GetTopicConfigurationv1alpha2(req.Msg)

	resp, err := s.targetService.GetTopicConfigurations(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	configs := s.mapper.v1alpha2TopicConfigsv1alpha1(resp.Msg.GetConfigurations())

	return connect.NewResponse(&v1alpha1.GetTopicConfigurationsResponse{Configurations: configs}), nil
}

// UpdateTopicConfigurations patches a topic's configuration. In contrast to SetTopicConfiguration
// this will only change the configurations that have been passed into this request.
func (s *Service) UpdateTopicConfigurations(ctx context.Context, req *connect.Request[v1alpha1.UpdateTopicConfigurationsRequest]) (*connect.Response[v1alpha1.UpdateTopicConfigurationsResponse], error) {
	pr := s.mapper.v1alpha1UpdateTopicConfigurationv1alpha2(req.Msg)

	resp, err := s.targetService.UpdateTopicConfigurations(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	configs := s.mapper.v1alpha2TopicConfigsv1alpha1(resp.Msg.GetConfigurations())

	return connect.NewResponse(&v1alpha1.UpdateTopicConfigurationsResponse{Configurations: configs}), nil
}

// SetTopicConfigurations applies the given configuration to a topic, which may reset
// or overwrite existing configurations that are not provided as part of the request.
// If you want to patch certain configurations use UpdateTopicConfiguration instead.
func (s *Service) SetTopicConfigurations(ctx context.Context, req *connect.Request[v1alpha1.SetTopicConfigurationsRequest]) (*connect.Response[v1alpha1.SetTopicConfigurationsResponse], error) {
	pr := s.mapper.v1alpha1SetTopicConfigurationv1alpha2(req.Msg)

	resp, err := s.targetService.SetTopicConfigurations(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	configs := s.mapper.v1alpha2TopicConfigsv1alpha1(resp.Msg.GetConfigurations())

	return connect.NewResponse(&v1alpha1.SetTopicConfigurationsResponse{Configurations: configs}), nil
}

// CreateTopic creates a new Kafka topic.
func (s *Service) CreateTopic(ctx context.Context, req *connect.Request[v1alpha1.CreateTopicRequest]) (*connect.Response[v1alpha1.CreateTopicResponse], error) {
	pr := s.mapper.v1alpha1CreateTopicv1alpha2(req.Msg)

	resp, err := s.targetService.CreateTopic(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	msg := s.mapper.v1alpha2CreateTopicResponsev1alpha1(resp.Msg)

	connectResponse := connect.NewResponse(msg)
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))
	return connectResponse, nil
}
