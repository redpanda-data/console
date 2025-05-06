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
	"errors"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	adminapi "github.com/redpanda-data/common-go/rpadmin"
)

// handleGetUsers returns a list of Kafka users. Via the Kafka API we can only return users if our
// target Kafka cluster version is >2.7.0. If the target Kafka cluster version is <2.7.0, we return an
// empty array.
// Kafka can only return SCRAM-SHA users, so the response may not be complete. If our target is a Redpanda
// cluster where we have access to the Redpanda Admin API however, we can return all users.
// Thus, we try to indicate the completeness of the response.
func (api *API) handleGetUsers() http.HandlerFunc {
	type response struct {
		Users      []string `json:"users"`
		IsComplete bool     `json:"isComplete"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if api.RedpandaClientProvider != nil {
			redpandaCl, err := api.RedpandaClientProvider.GetRedpandaAPIClient(r.Context())
			if err != nil {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:     err,
					Status:  http.StatusServiceUnavailable,
					Message: fmt.Sprintf("failed to retrieve redpanda client: %v", err.Error()),
				})
				return
			}

			users, err := redpandaCl.ListUsers(r.Context())
			if err != nil {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:     err,
					Status:  http.StatusServiceUnavailable,
					Message: fmt.Sprintf("Failed to list users via Redpanda Admin API: %v", err.Error()),
				})
				return
			}

			rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{
				Users:      users,
				IsComplete: true,
			})
			return
		}

		// We can't return any users.
		rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{Users: []string{}, IsComplete: false})
	}
}

// CreateUserRequest is the schema for the request body when creating a new user.
type CreateUserRequest struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	Mechanism string `json:"mechanism"`
}

// OK validates the create user request.
func (c *CreateUserRequest) OK() error {
	if c.Username == "" {
		return errors.New("username must be set")
	}
	if c.Password == "" {
		return errors.New("password must be set")
	}

	switch c.Mechanism {
	case adminapi.ScramSha256, adminapi.ScramSha512:
	default:
		return errors.New("mechanism must be either SCRAM-SHA-256 or SCRAM-SHA-512")
	}

	return nil
}

func (api *API) handleCreateUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req CreateUserRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 4. Create user
		if api.RedpandaClientProvider != nil {
			redpandaCl, err := api.RedpandaClientProvider.GetRedpandaAPIClient(r.Context())
			if err != nil {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:     err,
					Status:  http.StatusServiceUnavailable,
					Message: fmt.Sprintf("failed to retrieve redpanda client: %v", err.Error()),
				})
				return
			}
			err = redpandaCl.CreateUser(r.Context(), req.Username, req.Password, req.Mechanism)
			if err != nil {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:     err,
					Status:  http.StatusServiceUnavailable,
					Message: fmt.Sprintf("Failed to create user via Redpanda Admin API: %v", err.Error()),
				})
				return
			}
			rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
			return
		}

		// 5. Return an error if we can't create any users
		rest.SendRESTError(w, r, api.Logger, &rest.Error{
			Err:     errors.New("redpanda Admin API is not enabled"),
			Status:  http.StatusServiceUnavailable,
			Message: "Redpanda Admin API is not enabled",
		})
	}
}

func (api *API) handleDeleteUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principalID := rest.GetURLParam(r, "principalID")
		if principalID == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     errors.New("user must be set"),
				Status:  http.StatusBadRequest,
				Message: "User must be set",
			})
			return
		}

		// 4. Delete user
		if api.RedpandaClientProvider != nil {
			redpandaCl, err := api.RedpandaClientProvider.GetRedpandaAPIClient(r.Context())
			if err != nil {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:     err,
					Status:  http.StatusServiceUnavailable,
					Message: fmt.Sprintf("failed to retrieve redpanda client: %v", err.Error()),
				})
				return
			}

			err = redpandaCl.DeleteUser(r.Context(), principalID)
			if err != nil {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:     err,
					Status:  http.StatusServiceUnavailable,
					Message: fmt.Sprintf("Failed to delete user via Redpanda Admin API: %v", err.Error()),
				})
				return
			}
			rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
			return
		}

		// 5. Return an error if we can't delete any users
		rest.SendRESTError(w, r, api.Logger, &rest.Error{
			Err:     errors.New("redpanda Admin API is not enabled"),
			Status:  http.StatusServiceUnavailable,
			Message: "Redpanda Admin API is not enabled",
		})
	}
}
