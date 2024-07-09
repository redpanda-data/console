// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package user

import (
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

func mapv1alpha1ToListUsersv1alpha2(m *v1alpha1.ListUsersRequest) *v1alpha2.ListUsersRequest {
	var filter *v1alpha2.ListUsersRequest_Filter

	if m.Filter != nil {
		filter = &v1alpha2.ListUsersRequest_Filter{
			Name:         m.GetFilter().GetName(),
			NameContains: m.GetFilter().GetNameContains(),
		}
	}

	return &v1alpha2.ListUsersRequest{
		Filter:    filter,
		PageSize:  m.GetPageSize(),
		PageToken: m.GetPageToken(),
	}
}

func mapv1alpha2UsersTov1alpha2(users []*v1alpha2.ListUsersResponse_User) []*v1alpha1.ListUsersResponse_User {
	out := make([]*v1alpha1.ListUsersResponse_User, 0, len(users))
	for _, u := range users {
		out = append(out, &v1alpha1.ListUsersResponse_User{
			Name:      u.GetName(),
			Mechanism: mapv1alpha2SASLMechanismTov1alpha1(u.Mechanism),
		})
	}

	return out
}

func mapv1alpha1ToCreateUserv1alpha2(m *v1alpha1.CreateUserRequest) *v1alpha2.CreateUserRequest {
	return &v1alpha2.CreateUserRequest{
		User: &v1alpha2.CreateUserRequest_User{
			Name:      m.GetUser().GetName(),
			Password:  m.GetUser().GetPassword(),
			Mechanism: mapv1alpha1SASLMechanismTov1alpha2(m.GetUser().GetMechanism()),
		},
	}
}

func mapv1alpha1ToUpdateUserv1alpha2(m *v1alpha1.UpdateUserRequest) *v1alpha2.UpdateUserRequest {
	return &v1alpha2.UpdateUserRequest{
		User: &v1alpha2.UpdateUserRequest_User{
			Name:      m.GetUser().GetName(),
			Password:  m.GetUser().GetPassword(),
			Mechanism: mapv1alpha1SASLMechanismTov1alpha2(m.GetUser().GetMechanism()),
		},
	}
}

func mapv1alpha1ToDeleteUserv1alpha2(m *v1alpha1.DeleteUserRequest) *v1alpha2.DeleteUserRequest {
	return &v1alpha2.DeleteUserRequest{
		Name: m.GetName(),
	}
}

func mapv1alpha2SASLMechanismTov1alpha1(m *v1alpha2.SASLMechanism) *v1alpha1.SASLMechanism {
	if m == nil {
		return nil
	}

	m2 := v1alpha1.SASLMechanism_SASL_MECHANISM_UNSPECIFIED
	switch *m {
	case v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256:
		m2 = v1alpha1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256
	case v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512:
		m2 = v1alpha1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512
	default:
		m2 = v1alpha1.SASLMechanism_SASL_MECHANISM_UNSPECIFIED
	}

	return &m2
}

func mapv1alpha1SASLMechanismTov1alpha2(m v1alpha1.SASLMechanism) v1alpha2.SASLMechanism {
	switch m {
	case v1alpha1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256:
		return v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256
	case v1alpha1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512:
		return v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512
	default:
		return v1alpha2.SASLMechanism_SASL_MECHANISM_UNSPECIFIED
	}
}
