// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package transform

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"

	"github.com/redpanda-data/console/backend/pkg/api"
)

const (
	// Define how many bytes are in a kilobyte (KB) and a megabyte (MB)
	kb int64 = 1024
	mb int64 = 1024 * kb
)

// Metadata is the transform metadata required to deploy a wasm transform
type Metadata struct {
	Name         string                         `json:"name"`
	InputTopic   string                         `json:"input_topic"`
	OutputTopics []string                       `json:"output_topics"`
	Environment  []adminapi.EnvironmentVariable `json:"environment"`
}

func (s *Service) HandleDeployTransform() http.HandlerFunc {
	type response struct {
		Transform *adminapi.TransformMetadata `json:"transform"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.Redpanda.AdminAPI.Enabled {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("you must enable the admin api to manage wasm transforms"),
				Status:   http.StatusServiceUnavailable,
				Message:  "you must enable the admin api to manage wasm transforms",
				IsSilent: false,
			})
			return
		}

		if err := r.ParseMultipartForm(50 * mb); err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "Could not parse multipart form",
				IsSilent: false,
			})
			return
		}

		metadataJSON := r.FormValue("metadata")
		if metadataJSON == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("metadata field is missing"),
				Status:   http.StatusBadRequest,
				Message:  "Could not find or parse form field metadata",
				IsSilent: false,
			})
			return
		}

		var msg Metadata
		if err := json.Unmarshal([]byte(metadataJSON), &msg); err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "Could not decode transform metadata",
				IsSilent: false,
			})
			return
		}

		wasmForm, _, err := r.FormFile("wasm_binary")
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "Could not find or parse form field wasm_binary",
				IsSilent: false,
			})
			return
		}
		defer wasmForm.Close()

		wasmBinary, err := io.ReadAll(wasmForm)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "Could not read wasm binary",
				IsSilent: false,
			})
		}

		if err := api.RedpandaSvc.DeployWasmTransform(r.Context(), adminapi.TransformMetadata{
			Name:         msg.Name,
			InputTopic:   msg.InputTopic,
			OutputTopics: msg.OutputTopics,
			Status:       nil,
			Environment:  msg.Environment,
		}, wasmBinary); err != nil {
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

		t, err := findExactTransformByName(transforms, msg.Name)
		if err != nil {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      err,
				Status:   http.StatusNotFound,
				Message:  "Could not find transform",
				IsSilent: false,
			})
			return
		}
		rest.SendResponse(w, r, api.Logger, http.StatusCreated, response{
			Transform: t,
		})
	}
}
