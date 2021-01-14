package api

import (
	"errors"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/twmb/franz-go/pkg/kmsg"
	"net/http"
)

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
