package api

import (
	_ "context"
	"fmt"
	"net/http"
	_ "time"

	"go.uber.org/zap"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/go-chi/chi"
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

		visibleTopics := make([]*owl.TopicOverview, 0, len(topics))
		for _, topic := range topics {
			// Check if logged in user is allowed to see this topic. If not remove the topic from the list.
			canSee, restErr := api.Hooks.Owl.CanSeeTopic(r.Context(), topic.TopicName)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}

			if canSee {
				visibleTopics = append(visibleTopics, topic)
			}

			// Attach allowed actions for each topic
			topic.AllowedActions, restErr = api.Hooks.Owl.AllowedTopicActions(r.Context(), topic.TopicName)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
		}

		response := response{
			Topics: visibleTopics,
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
		logger := api.Logger.With(zap.String("topic_name", topicName))

		// Check if logged in user is allowed to view partitions for the given topic
		canView, restErr := api.Hooks.Owl.CanViewTopicPartitions(r.Context(), topicName)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view partitions for the requested topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view partitions for that topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		partitions, err := api.OwlSvc.ListTopicPartitions(topicName)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic partitions for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicName:  topicName,
			Partitions: partitions,
		}
		rest.SendResponse(w, r, logger, http.StatusOK, res)
	}
}

// handleGetTopicConfig returns all set configuration options for a specific topic
func (api *API) handleGetTopicConfig() http.HandlerFunc {
	type response struct {
		TopicDescription *owl.TopicConfigs `json:"topicDescription"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))

		// Check if logged in user is allowed to view partitions for the given topic
		canView, restErr := api.Hooks.Owl.CanViewTopicConfig(r.Context(), topicName)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view config for the requested topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view the config for that topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		description, err := api.OwlSvc.GetTopicConfigs(topicName, []string{})
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic config for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicDescription: description,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

// handleGetTopicConsumers returns all consumers along with their summed lag which consume the given topic
func (api *API) handleGetTopicConsumers() http.HandlerFunc {
	type response struct {
		TopicName string                    `json:"topicName"`
		Consumers []*owl.TopicConsumerGroup `json:"topicConsumers"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))

		// Check if logged in user is allowed to view partitions for the given topic
		canView, restErr := api.Hooks.Owl.CanViewTopicConsumers(r.Context(), topicName)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view topic consumers for the requested topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view the config for that topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		consumers, err := api.OwlSvc.ListTopicConsumers(r.Context(), topicName)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic consumers for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicName: topicName,
			Consumers: consumers,
		}
		rest.SendResponse(w, r, logger, http.StatusOK, res)
	}
}
