// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package rpconnect

import (
	"github.com/redpanda-data/benthos/v4/public/service"

	consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

type mapper struct{}

func (*mapper) lintToProto(lint service.Lint) *consolev1alpha1.LintConfigResponse_Lint {
	return &consolev1alpha1.LintConfigResponse_Lint{
		Line:   int32(lint.Line),
		Column: int32(lint.Column),
		Reason: lint.What,
	}
}

func (m *mapper) lintsToProto(lints []service.Lint) []*consolev1alpha1.LintConfigResponse_Lint {
	result := make([]*consolev1alpha1.LintConfigResponse_Lint, len(lints))
	for i, lint := range lints {
		result[i] = m.lintToProto(lint)
	}

	return result
}
