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
	"errors"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// createTopicRequest defines the expected JSON body to create a topic.
type createTopicRequest struct {
	TopicName         string                     `json:"topicName"`
	PartitionCount    int32                      `json:"partitionCount"`
	ReplicationFactor int16                      `json:"replicationFactor"`
	Configs           []createTopicRequestConfig `json:"configs"`
}

// OK validates the individual fields.
func (c *createTopicRequest) OK() error {
	if c.TopicName == "" {
		return errors.New("topic name must be set")
	}
	if !isValidKafkaTopicName(c.TopicName) {
		return errors.New("valid characters for Kafka topics are the ASCII alphanumeric characters and '.', '_', '-'")
	}

	// Value -1 means that the partition count shall be inherited from the defaults (supported in req v4+).
	isValidPartitionCount := c.PartitionCount == -1 || c.PartitionCount >= 1
	if !isValidPartitionCount {
		return errors.New("you must create a topic with at least one partition")
	}

	// Value -1 means that the replication factor shall be inherited from the defaults (supported in req v4+).
	isValidReplicationFactor := c.ReplicationFactor == -1 || c.ReplicationFactor >= 1
	if !isValidReplicationFactor {
		return errors.New("replication factor must be 1 or more")
	}

	return nil
}

// ToKmsg transforms the request struct into a struct that is used by the Kafka client.
func (c *createTopicRequest) ToKmsg() kmsg.CreateTopicsRequestTopic {
	configs := make([]kmsg.CreateTopicsRequestTopicConfig, len(c.Configs))
	for i, config := range c.Configs {
		configs[i] = config.ToKmsg()
	}

	reqTopic := kmsg.NewCreateTopicsRequestTopic()
	reqTopic.Topic = c.TopicName
	reqTopic.NumPartitions = c.PartitionCount
	reqTopic.ReplicationFactor = c.ReplicationFactor
	reqTopic.Configs = configs

	return reqTopic
}

// createTopicRequestConfig defines the struct that is used for  topic configuration.
type createTopicRequestConfig struct {
	Name  string  `json:"name"`
	Value *string `json:"value"`
}

// OK validates the struct fields.
func (c *createTopicRequestConfig) OK() error {
	if c.Name == "" {
		return errors.New("a config name must be set")
	}

	return nil
}

// ToKmsg transforms the request struct into a struct that is used by the Kafka client.
func (c *createTopicRequestConfig) ToKmsg() kmsg.CreateTopicsRequestTopicConfig {
	reqTopicConfig := kmsg.NewCreateTopicsRequestTopicConfig()
	reqTopicConfig.Name = c.Name
	reqTopicConfig.Value = c.Value

	return reqTopicConfig
}

func (api *API) handleCreateTopic() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req createTopicRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Try to create topic
		createTopicResponse, restErr := api.ConsoleSvc.CreateTopic(r.Context(), req.ToKmsg())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, createTopicResponse)
	}
}
