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
	"fmt"
	"net/http"
	"strings"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/console"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (api *API) handleGetAllTopicDetails() http.HandlerFunc {
	type response struct {
		Topics []console.TopicDetails `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		var topicNames []string
		requestedTopicNames := r.URL.Query().Get("topicNames")
		if requestedTopicNames != "" {
			topicNames = strings.Split(requestedTopicNames, ",")
		}

		topicDetails, restErr := api.ConsoleSvc.GetTopicDetails(r.Context(), topicNames)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Kowl business hook - only include topics the user is allowed to see
		visibleTopics := make([]console.TopicDetails, 0, len(topicDetails))
		for _, topic := range topicDetails {
			// Check if logged in user is allowed to see this topic, if not - don't add it to the list of returned topics
			canSee, restErr := api.Hooks.Console.CanSeeTopic(r.Context(), topic.TopicName)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}

			if canSee {
				visibleTopics = append(visibleTopics, topic)
			}
		}

		res := response{
			Topics: visibleTopics,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}

}

func (api *API) handleGetPartitionReassignments() http.HandlerFunc {
	type response struct {
		Topics []console.PartitionReassignments `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Check if logged in user (Console Business) is allowed to list reassignments
		isAllowed, restErr := api.Hooks.Console.CanPatchPartitionReassignments(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to patch partition assignments"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to reassign partitions",
				IsSilent: false,
			})
			return
		}

		// 2. Fetch in progress reassignments (supported by Kafka 2.4.0+)
		topics, err := api.ConsoleSvc.ListPartitionReassignments(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list active partition reassignments",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := response{
			Topics: topics,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}

type patchPartitionsRequest struct {
	Topics []struct {
		// Topic is a topic to commit offsets for.
		TopicName string `json:"topicName"`

		// Partitions contains partitions in a topic for which to commit offsets.
		Partitions []struct {
			// PartitionID is a partition to reassign.
			PartitionID int32 `json:"partitionId"`

			// Replicas are replicas to place the partition on, or null to cancel a pending reassignment of this partition.
			Replicas []int32 `json:"replicas"`
		} `json:"partitions"`
	} `json:"topics"`
}

func (p *patchPartitionsRequest) OK() error {
	if p.Topics == nil {
		return fmt.Errorf("at least one topic and partition must be set")
	}
	for _, topic := range p.Topics {
		if topic.Partitions == nil {
			return fmt.Errorf("topic '%v' has no partitions set whose assignments shall be altered", topic.TopicName)
		}
	}

	return nil
}

func (api *API) handlePatchPartitionAssignments() http.HandlerFunc {
	type response struct {
		ReassignPartitionsResponse []console.AlterPartitionReassignmentsResponse `json:"reassignPartitionsResponses"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req patchPartitionsRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Check if logged in user is allowed to reassign partitions (always true for Console OSS, but not
		// for RP Console Business)
		isAllowed, restErr := api.Hooks.Console.CanPatchPartitionReassignments(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to patch partition assignments"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to reassign partitions",
				IsSilent: false,
			})
			return
		}

		// 3. Submit reassign partitions request
		kmsgReq := make([]kmsg.AlterPartitionAssignmentsRequestTopic, len(req.Topics))
		for i, topic := range req.Topics {
			partitions := make([]kmsg.AlterPartitionAssignmentsRequestTopicPartition, len(topic.Partitions))
			for j, partition := range topic.Partitions {
				partitionReq := kmsg.NewAlterPartitionAssignmentsRequestTopicPartition()
				partitionReq.Partition = partition.PartitionID
				partitionReq.Replicas = partition.Replicas

				partitions[j] = partitionReq
			}
			topicReq := kmsg.NewAlterPartitionAssignmentsRequestTopic()
			topicReq.Topic = topic.TopicName
			topicReq.Partitions = partitions
			kmsgReq[i] = topicReq
		}

		// 4. Check response and pass it to the frontend
		owlRes, err := api.ConsoleSvc.AlterPartitionAssignments(r.Context(), kmsgReq)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  fmt.Sprintf("Reassign partition request has failed: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{ReassignPartitionsResponse: owlRes}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

type patchConfigsRequest struct {
	// Resources contains all resources that shall be altered
	Resources []patchConfigsRequestResource `json:"resources"`
}

func (p *patchConfigsRequest) OK() error {
	if p.Resources == nil {
		return fmt.Errorf("at least one resource must be set")
	}
	for i, res := range p.Resources {
		err := res.OK()
		if err != nil {
			return fmt.Errorf("failed to validate resource with index '%d': %w", i, err)
		}
	}

	return nil
}

type patchConfigsRequestResource struct {
	// ResourceType is an enum that represents TOPIC, BROKER or BROKER_LOGGER
	ResourceType int8 `json:"resourceType"`

	// ResourceName is the name of config to alter.
	//
	// If the requested type is a topic, this corresponds to a topic name.
	//
	// If the requested type if a broker, this should either be empty or be
	// the ID of the broker this request is issued to. If it is empty, this
	// updates all broker configs. If a specific ID, this updates just the
	// broker. Using a specific ID also ensures that brokers reload config
	// or secret files even if the file path has not changed. Lastly, password
	// config options can only be defined on a per broker basis.
	//
	// If the type is broker logger, this must be a broker ID.
	ResourceName string `json:"resourceName"`

	// Configs contains key/value config pairs to set on the resource.
	Configs []patchConfigsRequestResourceConfig `json:"configs"`
}

func (p *patchConfigsRequestResource) OK() error {
	resourceType := kmsg.ConfigResourceType(p.ResourceType).String()
	if resourceType == kmsg.ConfigResourceTypeUnknown.String() {
		return fmt.Errorf("given resourceType '%d' is invalid", p.ResourceType)
	}

	if p.Configs == nil {
		return fmt.Errorf("at least one config must be set")
	}

	for i, cfg := range p.Configs {
		err := cfg.OK()
		if err != nil {
			return fmt.Errorf("failed to validate config with index '%d': %w", i, err)
		}
	}

	return nil
}

type patchConfigsRequestResourceConfig struct {
	// Name is a key to modify (e.g. segment.bytes).
	Name string `json:"name"`

	// Op is the type of operation (SET, DELETE, APPEND, SUBTRACT) to perform for this config name.
	Op int8 `json:"op"`

	// Value is a value to set for the key (e.g. 10).
	Value *string `json:"value"`
}

func (p *patchConfigsRequestResourceConfig) OK() error {
	if p.Name == "" {
		return fmt.Errorf("config name must be specified")
	}
	if p.Op < 0 || p.Op > 4 {
		return fmt.Errorf("invalid op '%d' specified. must be between 0 and 4", p.Op)
	}

	return nil
}

func (api *API) handlePatchConfigs() http.HandlerFunc {
	type response struct {
		PatchedConfigs []console.IncrementalAlterConfigsResourceResponse `json:"patchedConfigs"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req patchConfigsRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Check if logged in user is allowed to alter configs (always true for Kowl, but not for Kowl Business)
		isAllowed, restErr := api.Hooks.Console.CanPatchConfigs(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to alter configs"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to alter configs",
				IsSilent: false,
			})
			return
		}

		// 3. Submit incremental alter config request
		kmsgReq := make([]kmsg.IncrementalAlterConfigsRequestResource, len(req.Resources))
		for i, resource := range req.Resources {
			alterResource := kmsg.NewIncrementalAlterConfigsRequestResource()
			alterResource.ResourceType = kmsg.ConfigResourceType(resource.ResourceType)
			alterResource.ResourceName = resource.ResourceName
			cfgReqs := make([]kmsg.IncrementalAlterConfigsRequestResourceConfig, len(resource.Configs))
			for j, cfg := range resource.Configs {
				cfgReq := kmsg.NewIncrementalAlterConfigsRequestResourceConfig()
				cfgReq.Name = cfg.Name
				cfgReq.Op = kmsg.IncrementalAlterConfigOp(cfg.Op)
				cfgReq.Value = cfg.Value
				cfgReqs[j] = cfgReq
			}
			alterResource.Configs = cfgReqs
			kmsgReq[i] = alterResource
		}

		// 4. Check response and pass it to the frontend
		patchedCfgs, restErr := api.ConsoleSvc.IncrementalAlterConfigs(r.Context(), kmsgReq)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{PatchedConfigs: patchedCfgs}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
