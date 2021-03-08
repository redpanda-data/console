package api

import (
	"errors"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/twmb/franz-go/pkg/kmsg"
	"net/http"
)

func (api *API) handleGetAllTopicDetails() http.HandlerFunc {
	type response struct {
		Topics []owl.TopicDetails `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// TODO: Add proper Kowl Business hook

		topicDetails, restErr := api.OwlSvc.GetTopicDetails(r.Context(), nil)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{
			Topics: topicDetails,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}

}

func (api *API) handleGetPartitionReassignments() http.HandlerFunc {
	type response struct {
		Topics []owl.PartitionReassignments `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topics, err := api.OwlSvc.ListPartitionReassignments(r.Context())
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
		ReassignPartitionsResponse []owl.AlterPartitionReassignmentsResponse `json:"reassignPartitionsResponses"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req patchPartitionsRequest
		err := rest.Decode(w, r, &req)
		if err != nil {
			var mr *rest.MalformedRequest
			if errors.As(err, &mr) {
				restErr := &rest.Error{
					Err:      fmt.Errorf(mr.Error()),
					Status:   mr.Status,
					Message:  mr.Message,
					IsSilent: false,
				}
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			} else {
				restErr := &rest.Error{
					Err:      err,
					Status:   http.StatusInternalServerError,
					Message:  fmt.Sprintf("Failed to decode request payload: %v", err.Error()),
					IsSilent: false,
				}
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
			return
		}

		// 2. Check if logged in user is allowed to reassign partitions (always true for Kowl, but not for Kowl Business)
		isAllowed, restErr := api.Hooks.Owl.CanPatchPartitionReassignments(r.Context())
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
		owlRes, err := api.OwlSvc.AlterPartitionAssignments(r.Context(), kmsgReq)
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
		PatchedConfigs []owl.IncrementalAlterConfigsResourceResponse `json:"patchedConfigs"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req patchConfigsRequest
		err := rest.Decode(w, r, &req)
		if err != nil {
			var mr *rest.MalformedRequest
			if errors.As(err, &mr) {
				restErr := &rest.Error{
					Err:      fmt.Errorf(mr.Error()),
					Status:   mr.Status,
					Message:  mr.Message,
					IsSilent: false,
				}
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			} else {
				restErr := &rest.Error{
					Err:      err,
					Status:   http.StatusInternalServerError,
					Message:  fmt.Sprintf("Failed to decode request payload: %v", err.Error()),
					IsSilent: false,
				}
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
			return
		}

		// 2. Check if logged in user is allowed to alter configs (always true for Kowl, but not for Kowl Business)
		isAllowed, restErr := api.Hooks.Owl.CanPatchConfigs(r.Context())
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
				cfgReq.Op = cfg.Op
				cfgReq.Value = cfg.Value
				cfgReqs[j] = cfgReq
			}
			alterResource.Configs = cfgReqs
			kmsgReq[i] = alterResource
		}

		// 4. Check response and pass it to the frontend
		patchedCfgs, restErr := api.OwlSvc.IncrementalAlterConfigs(r.Context(), kmsgReq)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{PatchedConfigs: patchedCfgs}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
