// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"
)

// GetTransformRequest defines the expected JSON body to get a transform.
type GetTransformRequest struct {
	TransformName string `json:"name"`
}

func findTransformByName(ts []adminapi.TransformMetadata, name string) (*adminapi.TransformMetadata, error) {
	for _, t := range ts {
		if t.Name == name {
			return &t, nil
		}
	}
	return nil, fmt.Errorf("transform not found")
}

func (api *API) handleGetTransform() http.HandlerFunc {
	type response struct {
		Transform *adminapi.TransformMetadata `json:"transform"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canList, restErr := api.Hooks.Authorization.CanListTransforms(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canList {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to list wasm transforms"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to list wasm transforms",
				IsSilent: false,
			})
			return
		}

		if !api.Cfg.Redpanda.AdminAPI.Enabled {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("you must enable the admin api to manage wasm transforms"),
				Status:   http.StatusBadRequest,
				Message:  "you must enable the admin api to manage wasm transforms",
				IsSilent: false,
			})
			return
		}

		var msg GetTransformRequest
		if restErr := rest.Decode(w, r, &msg); restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		transforms, err := api.RedpandaSvc.ListWasmTransforms(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list wasm transforms from Kafka cluster",
				IsSilent: false,
			})
			return
		}

		t, err := findTransformByName(transforms, msg.TransformName)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusNotFound,
				Message:  "Could not find transform",
				IsSilent: false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, response{
			Transform: t,
		})
	}
}

// ListTransformsRequest defines the expected JSON body to list transforms.
type ListTransformsRequest struct {
	Transforms []adminapi.TransformMetadata `json:"transforms"`
}

func (api *API) handleListTransforms() http.HandlerFunc {
	type response struct {
		Transforms []adminapi.TransformMetadata `json:"transforms"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		canList, restErr := api.Hooks.Authorization.CanListTransforms(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canList {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to list wasm transforms"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to list wasm transforms",
				IsSilent: false,
			})
			return
		}

		if !api.Cfg.Redpanda.AdminAPI.Enabled {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("you must enable the admin api to manage wasm transforms"),
				Status:   http.StatusBadRequest,
				Message:  "you must enable the admin api to manage wasm transforms",
				IsSilent: false,
			})
			return
		}

		transforms, err := api.RedpandaSvc.ListWasmTransforms(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list wasm transforms from Kafka cluster",
				IsSilent: false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, response{
			Transforms: transforms,
		})
	}
}

// DeployTransformRequest defines the expected JSON body to deploy a transform.
type DeployTransformRequest struct {
	Name         string                         `json:"name"`
	InputTopic   string                         `json:"input_topic"`
	OutputTopics []string                       `json:"output_topics"`
	Environment  []adminapi.EnvironmentVariable `json:"environment"`
	WasmBinary   []byte                         `json:"wasm_binary"`
}

func (api *API) handleDeployTransform() http.HandlerFunc {
	type response struct {
		Transform *adminapi.TransformMetadata `json:"transform"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		canList, restErr := api.Hooks.Authorization.CanDeployTransform(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canList {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to list wasm transforms"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to list wasm transforms",
				IsSilent: false,
			})
			return
		}

		if !api.Cfg.Redpanda.AdminAPI.Enabled {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("you must enable the admin api to manage wasm transforms"),
				Status:   http.StatusBadRequest,
				Message:  "you must enable the admin api to manage wasm transforms",
				IsSilent: false,
			})
			return
		}

		var msg DeployTransformRequest
		if restErr := rest.Decode(w, r, &msg); restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		if err := api.RedpandaSvc.DeployWasmTransform(r.Context(), adminapi.TransformMetadata{
			Name:         msg.Name,
			InputTopic:   msg.InputTopic,
			OutputTopics: msg.OutputTopics,
			Status:       nil,
			Environment:  msg.Environment,
		}, msg.WasmBinary); err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not deploy wasm transform",
				IsSilent: false,
			})
			return
		}

		transforms, err := api.RedpandaSvc.ListWasmTransforms(r.Context())
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list wasm transforms from Kafka cluster",
				IsSilent: false,
			})
			return
		}

		t, err := findTransformByName(transforms, msg.Name)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusNotFound,
				Message:  "Could not find transform",
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response{
			Transform: t,
		})
	}
}

// DeleteTransformRequest defines the expected JSON body to delete a transform.
type DeleteTransformRequest struct {
	TransformName string `json:"name"`
}

func (api *API) handleDeleteTransform() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		canDelete, restErr := api.Hooks.Authorization.CanDeleteTransform(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canDelete {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to list wasm transforms"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to list wasm transforms",
				IsSilent: false,
			})
			return
		}

		if !api.Cfg.Redpanda.AdminAPI.Enabled {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("you must enable the admin api to manage wasm transforms"),
				Status:   http.StatusBadRequest,
				Message:  "you must enable the admin api to manage wasm transforms",
				IsSilent: false,
			})
			return
		}

		var msg DeleteTransformRequest
		if restErr := rest.Decode(w, r, &msg); restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		if err := api.RedpandaSvc.DeleteWasmTransform(r.Context(), msg.TransformName); err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not delete wasm transform",
				IsSilent: false,
			})
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
