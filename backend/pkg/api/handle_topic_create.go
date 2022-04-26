package api

import (
	"fmt"
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
		return fmt.Errorf("topic name must be set")
	}
	if !isValidKafkaTopicName(c.TopicName) {
		return fmt.Errorf("valid characters for Kafka topics are the ASCII alphanumeric characters and '.', '_', '-'")
	}

	// Value -1 means that the partition count shall be inherited from the defaults (supported in req v4+).
	isValidPartitionCount := c.PartitionCount == -1 || c.PartitionCount >= 1
	if !isValidPartitionCount {
		return fmt.Errorf("you must create a topic with at least one partition")
	}

	// Value -1 means that the replication factor shall be inherited from the defaults (supported in req v4+).
	isValidReplicationFactor := c.ReplicationFactor == -1 || c.ReplicationFactor >= 1
	if !isValidReplicationFactor {
		return fmt.Errorf("replication factor must be 1 or more")
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
		return fmt.Errorf("a config name must be set")
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

		// 2. Check if logged in user is allowed to view partitions for the given topic
		canCreate, restErr := api.Hooks.Owl.CanCreateTopic(r.Context(), req.TopicName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canCreate {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to create this topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to create this topic.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Try to create topic
		createTopicResponse, restErr := api.OwlSvc.CreateTopic(r.Context(), req.ToKmsg())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, createTopicResponse)
	}
}
