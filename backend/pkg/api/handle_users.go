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
	"github.com/go-chi/chi/v5"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/api/admin"
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
		// 1. Check if logged-in user is allowed to list Kafka users
		canList, restErr := api.Hooks.Console.CanListKafkaUsers(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canList {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to list Kafka users"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to list Kafka users.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		if api.Cfg.Redpanda.AdminAPI.Enabled {
			users, err := api.RedpandaSvc.ListUsers(r.Context())
			if err != nil {
				rest.SendRESTError(w, r, api.Logger, &rest.Error{
					Err:     err,
					Status:  http.StatusServiceUnavailable,
					Message: fmt.Sprintf("Failed to list users via Redpanda Admin API: %v", err.Error()),
				})
				return
			}
			filteredUsers := make([]string, 0, len(users))
			for _, user := range users {
				if api.Hooks.Console.IsProtectedKafkaUser(user) {
					continue
				}
				filteredUsers = append(filteredUsers, user)
			}
			rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{
				Users:      filteredUsers,
				IsComplete: true,
			})
			return
		}

		// We can't return any users.
		rest.SendResponse(w, r, api.Logger, http.StatusOK, &response{Users: []string{}, IsComplete: false})
	}
}

type createUserRequest struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	Mechanism string `json:"mechanism"`
}

func (c *createUserRequest) OK() error {
	if c.Username == "" {
		return fmt.Errorf("username must be set")
	}
	if c.Password == "" {
		return fmt.Errorf("password must be set")
	}

	switch c.Mechanism {
	case admin.ScramSha256, admin.ScramSha512:
	default:
		return fmt.Errorf("mechanism must be either SCRAM-SHA-256 or SCRAM-SHA-512")
	}

	return nil
}

func (api *API) handleCreateUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse and validate request
		var req createUserRequest
		restErr := rest.Decode(w, r, &req)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Check if logged-in user is allowed to create Kafka users
		canCreate, restErr := api.Hooks.Console.CanCreateKafkaUsers(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canCreate {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to create Kafka users"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to create Kafka users.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Check if targeted user is a protected user
		if api.Hooks.Console.IsProtectedKafkaUser(req.Username) {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester tried to create a protected Kafka user"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to create a Kafka user with this name",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 4. Create user
		if api.Cfg.Redpanda.AdminAPI.Enabled {
			err := api.RedpandaSvc.CreateUser(r.Context(), req.Username, req.Password, req.Mechanism)
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
			Err:     fmt.Errorf("redpanda Admin API is not enabled"),
			Status:  http.StatusServiceUnavailable,
			Message: "Redpanda Admin API is not enabled",
		})
	}
}

func (api *API) handleDeleteUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principalID := chi.URLParam(r, "principalID")
		if principalID == "" {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:     fmt.Errorf("user must be set"),
				Status:  http.StatusBadRequest,
				Message: "User must be set",
			})
			return
		}

		// 2. Check if logged-in user is allowed to delete Kafka users
		canDelete, restErr := api.Hooks.Console.CanDeleteKafkaUsers(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canDelete {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to delete Kafka users"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to delete Kafka users.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 3. Check if targeted user is a protected user
		if api.Hooks.Console.IsProtectedKafkaUser(principalID) {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester tried to delete a protected Kafka user"),
				Status:   http.StatusForbidden,
				Message:  "You are not allowed to delete this protected Kafka user",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 4. Delete user
		if api.Cfg.Redpanda.AdminAPI.Enabled {
			err := api.RedpandaSvc.DeleteUser(r.Context(), principalID)
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
			Err:     fmt.Errorf("redpanda Admin API is not enabled"),
			Status:  http.StatusServiceUnavailable,
			Message: "Redpanda Admin API is not enabled",
		})
	}
}
