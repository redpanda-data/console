package api

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi"
	"github.com/gorilla/schema"
	"github.com/kafka-owl/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"github.com/kafka-owl/kafka-owl/pkg/owl"
)

func (api *API) handleGetTopics() http.HandlerFunc {
	type response struct {
		Topics []*owl.TopicOverview `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topics, err := api.OwlSvc.GetTopicsOverview()
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topics from Kafka cluster",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		api.Hooks.Topic.FilterTopics(r.Context(), topics)

		response := response{
			Topics: topics,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}

// GetTopicMessagesResponse is a wrapper for an array of TopicMessage
type GetTopicMessagesResponse struct {
	KafkaMessages *kafka.ListMessageResponse `json:"kafkaMessages"`
}

func (api *API) handleGetMessages() http.HandlerFunc {
	decoder := schema.NewDecoder()
	decoder.IgnoreUnknownKeys(true)
	type request struct {
		StartOffset int64  `schema:"startOffset,required"` // -1 for newest, -2 for oldest offset
		PartitionID int32  `schema:"partitionID,required"` // -1 for all partition ids
		PageSize    uint16 `schema:"pageSize,required"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		query := r.URL.Query()

		var req request
		err := decoder.Decode(&req, query)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "The given query parameters are invalid",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Request messages from kafka and return them once we got all the messages or the context is done
		listReq := kafka.ListMessageRequest{
			TopicName:    topicName,
			PartitionID:  req.PartitionID,
			StartOffset:  req.StartOffset,
			MessageCount: req.PageSize,
		}
		ctx, cancelCtx := context.WithTimeout(r.Context(), 18*time.Second)
		defer cancelCtx()
		messages, err := api.KafkaSvc.ListMessages(ctx, listReq)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list messages for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := &GetTopicMessagesResponse{
			KafkaMessages: messages,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}

// handleGetPartitions returns an overview of all partitions and their watermarks in the given topic
func (api *API) handleGetPartitions() http.HandlerFunc {
	type response struct {
		TopicName  string               `json:"topicName"`
		Partitions []owl.TopicPartition `json:"partitions"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		partitions, err := api.OwlSvc.ListTopicPartitions(topicName)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic partitions for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{
			TopicName:  topicName,
			Partitions: partitions,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

// handleGetTopicConfig returns all set configuration options for a specific topic
func (api *API) handleGetTopicConfig() http.HandlerFunc {
	type response struct {
		TopicDescription *owl.TopicConfigs `json:"topicDescription"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		description, err := api.OwlSvc.GetTopicConfigs(topicName, []string{})
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic config for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{
			TopicDescription: description,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
