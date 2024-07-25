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
	"github.com/benthosdev/benthos/v4/public/service"

	consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/rpconnect/graph"
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

func (m *mapper) treeNodeToProto(nodes []*graph.TreeNode) []*consolev1alpha1.TreeNode {
	protoNodes := make([]*consolev1alpha1.TreeNode, 0, len(nodes))
	for _, n := range nodes {
		children := m.treeNodeToProto(n.Children)

		grouped := make([]*consolev1alpha1.TreeNodeGroup, 0, len(n.GroupedChildren))
		for _, nc := range n.GroupedChildren {
			grouped = append(grouped, &consolev1alpha1.TreeNodeGroup{
				Children: m.treeNodeToProto(nc),
			})
		}

		actions := make([]*consolev1alpha1.NodeAction, 0, len(n.Actions))

		for _, a := range n.Actions {
			actions = append(actions, &consolev1alpha1.NodeAction{
				Operation: patchOperationToProto(a.Operation),
				Path:      a.Path,
				Kind:      a.Kind,
			})
		}

		protoNodes = append(protoNodes, &consolev1alpha1.TreeNode{
			Label:          n.Label,
			Kind:           n.Kind,
			Path:           n.Path,
			Type:           n.Type,
			Children:       children,
			GoupedChildren: grouped,
			RootAction:     n.RootAction,
			Actions:        actions,
			LineStart:      int32(n.LineStart),
			LineEnd:        int32(n.LineEnd),
			LintErrors:     n.LintErrors,
		})
	}

	return protoNodes
}

func patchOperationToProto(op graph.PatchOperation) consolev1alpha1.PatchOperation {
	switch op {
	case graph.PatchAddOp:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_ADD
	case graph.PatchAddFromOp:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_ADD_FROM
	case graph.PatchDeleteOp:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_DELETE
	case graph.PatchSetOp:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_SET
	case graph.PatchReplaceOp:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_REPLACE
	case graph.PatchCopyOp:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_COPY
	case graph.PatchMoveAbove:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_MOVE_ABOVE
	case graph.PatchMoveBelow:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_MOVE_BELOW
	default:
		return consolev1alpha1.PatchOperation_PATCH_OPERATION_UNSPECIFIED
	}
}
