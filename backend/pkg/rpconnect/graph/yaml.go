package graph

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/docs"
)

// sliceToJSONPointer creates a JSON pointer path
// (https://tools.ietf.org/html/rfc6901) from a slice of path segments.
//
// Because the characters '~' (%x7E) and '/' (%x2F) have special meanings in
// paths, '~' needs to be encoded as '~0' and '/' needs to be encoded as
// '~1' when these characters appear in a reference key.
func sliceToJSONPointer(path []string) string {
	if len(path) == 0 {
		return ""
	}
	var buf bytes.Buffer
	for _, seg := range path {
		seg = strings.ReplaceAll(seg, "~", "~0")
		seg = strings.ReplaceAll(seg, "/", "~1")
		buf.WriteByte('/')
		buf.WriteString(seg)
	}
	return buf.String()
}

func getLastLine(node *yaml.Node) int {
	if len(node.Content) == 0 {
		lines := strings.Count(node.Value, "\n")
		return node.Line + lines
	}
	return getLastLine(node.Content[len(node.Content)-1])
}

const batchingProcessorLabel = "batching processors"

func moveBatchingProcs(spec docs.ComponentSpec, children []*TreeNode) []*TreeNode {
	var batchingNode *TreeNode
	for _, c := range children {
		if c.Label == batchingProcessorLabel {
			batchingNode = c
		}
	}
	if batchingNode == nil {
		return children
	}

	sorted := make([]*TreeNode, 0, len(children))
	if spec.Type == docs.TypeInput {
		sorted = append(sorted, batchingNode)
	}

	for _, c := range children {
		if c == batchingNode {
			continue
		}
		sorted = append(sorted, c)
	}

	if spec.Type != docs.TypeInput {
		sorted = append(sorted, batchingNode)
	}
	return sorted
}

func yamlFieldToTree(field docs.FieldSpec, cpath []string, node *yaml.Node, prov docs.Provider) (treeNodes []*TreeNode, err error) {
	node = unwrapDocumentNode(node)

	switch field.Kind {
	case docs.Kind2DArray:
		field = field.Array()
		for i := 0; i < len(node.Content); i++ {
			var nextTNodes []*TreeNode
			if nextTNodes, err = yamlFieldToTree(field, append(cpath, strconv.Itoa(i)), node.Content[i], prov); err != nil {
				return
			}
			treeNodes = append(treeNodes, nextTNodes...)
		}
		return
	case docs.KindArray:
		field = field.Scalar()
		for i := 0; i < len(node.Content); i++ {
			var nextTNodes []*TreeNode
			if nextTNodes, err = yamlFieldToTree(field, append(cpath, strconv.Itoa(i)), node.Content[i], prov); err != nil {
				return
			}
			// for _, nextNode := range nextTNodes {
			// 	if i < (len(node.Content) - 1) {
			// 		nextNode.Actions = append(nextNode.Actions, NodeAction{Operation: PatchMoveAbove})
			// 	} else {
			// 		nextNode.Actions = append(nextNode.Actions, NodeAction{Operation: PatchMoveAbove}, NodeAction{Operation: PatchMoveBelow})
			// 	}
			// }
			treeNodes = append(treeNodes, nextTNodes...)
		}
		return
	case docs.KindMap:
		field = field.Scalar()
		for i := 0; i < len(node.Content)-1; i += 2 {
			var nextTNodes []*TreeNode
			if nextTNodes, err = yamlFieldToTree(field, append(cpath, node.Content[i].Value), node.Content[i+1], prov); err != nil {
				return
			}
			treeNodes = append(treeNodes, nextTNodes...)
		}
		return
	}

	if coreType, is := field.Type.IsCoreComponent(); is {
		var spec docs.ComponentSpec
		if _, spec, err = docs.GetInferenceCandidateFromYAML(prov, coreType, node); err != nil {
			return
		}
		tnode := &TreeNode{
			Kind: string(coreType),
			Type: spec.Name,
			Path: sliceToJSONPointer(cpath),
			// LineStart: node.Line,
			// LineEnd:   getLastLine(node),
		}

		// for _, action := range componentActions(coreType) {
		// 	action.Path = path.Join(tnode.Path, action.Path)
		// 	tnode.Actions = append(tnode.Actions, action)
		// }

		// for _, a := range fieldToActions(spec.Config) {
		// 	a.Path = path.Join(tnode.Path, spec.Name, a.Path)
		// 	tnode.Actions = append(tnode.Actions, a)
		// }

		reserved := docs.ReservedFieldsByType(coreType)
		for i := 0; i < len(node.Content)-1; i += 2 {
			if node.Content[i].Value == "label" {
				tnode.Label = node.Content[i+1].Value
			}
			if node.Content[i].Value == "resource" && tnode.Label == "" {
				tnode.Label = node.Content[i+1].Value
			}
			if f, exists := reserved[node.Content[i].Value]; exists {
				nodes, err := yamlFieldToTree(f, append(cpath, f.Name), node.Content[i+1], prov)
				if err != nil {
					return nil, err
				}
				tnode.Children = append(tnode.Children, nodes...)
			}
			if node.Content[i].Value == spec.Name {
				tmpChildren, tmpGroupedChildren, err := yamlComponentToTrees(spec, append(cpath, spec.Name), node.Content[i+1], prov)
				if err != nil {
					return nil, err
				}

				// Type children come first above outter component children
				tnode.Children = append(tmpChildren, tnode.Children...)

				// Grouped children only come from a direct component
				tnode.GroupedChildren = tmpGroupedChildren
			}
		}

		if spec.Type == docs.TypeInput || spec.Type == docs.TypeOutput {
			tnode.Children = moveBatchingProcs(spec, tnode.Children)
		}

		complementWithAddFrom(tnode)
		return []*TreeNode{tnode}, nil
	}
	if len(field.Children) > 0 {
		return yamlFieldsToTree(field.Children, cpath, node, prov)
	}
	return nil, nil
}

func yamlFieldsToTree(fields docs.FieldSpecs, path []string, node *yaml.Node, prov docs.Provider) (treeNodes []*TreeNode, err error) {
	node = unwrapDocumentNode(node)

	fieldsMap := map[string]docs.FieldSpec{}
	for _, field := range fields {
		fieldsMap[field.Name] = field
	}

	for i := 0; i < len(node.Content)-1; i += 2 {
		fieldName := node.Content[i].Value

		if f, exists := fieldsMap[fieldName]; exists {
			var fieldNodes []*TreeNode
			if fieldNodes, err = yamlFieldToTree(f, append(path, fieldName), node.Content[i+1], prov); err != nil {
				return
			}
			treeNodes = append(treeNodes, fieldNodes...)
		}
	}
	return
}

func yamlFieldsToTreeSplitBatching(fields docs.FieldSpecs, path []string, node *yaml.Node, prov docs.Provider) ([]*TreeNode, error) {
	node = unwrapDocumentNode(node)

	fieldsMap := map[string]docs.FieldSpec{}
	for _, field := range fields {
		fieldsMap[field.Name] = field
	}

	var tmpNodes, batchNodes []*TreeNode

	for i := 0; i < len(node.Content)-1; i += 2 {
		fieldName := node.Content[i].Value
		f, exists := fieldsMap[fieldName]
		if !exists {
			continue
		}

		fieldNodes, err := yamlFieldToTree(f, append(path, fieldName), node.Content[i+1], prov)
		if err != nil {
			return nil, err
		}
		if f.Name == "batching" {
			batchNodes = append(batchNodes, fieldNodes...)
		} else {
			tmpNodes = append(tmpNodes, fieldNodes...)
		}
	}
	if len(batchNodes) == 0 {
		return tmpNodes, nil
	}

	return append(tmpNodes, &TreeNode{
		Label:    batchingProcessorLabel,
		Children: batchNodes,
		// Actions: []NodeAction{
		// 	{
		// 		Operation: "add",
		// 		Path:      sliceToJSONPointer(path) + "/batching/processors",
		// 		Kind:      "processor",
		// 	},
		// },
	}), nil
}

func outputSwitchCases(fields docs.FieldSpecs, path []string, node *yaml.Node, prov docs.Provider) ([]*TreeNode, error) {
	node = unwrapDocumentNode(node)

	fieldsMap := map[string]docs.FieldSpec{}
	for _, field := range fields {
		fieldsMap[field.Name] = field
	}

	var tmpNodes []*TreeNode
	for i := 0; i < len(node.Content)-1; i += 2 {
		fieldName := node.Content[i].Value
		f, exists := fieldsMap[fieldName]
		if !exists {
			continue
		}

		if fieldName == "cases" {
			scalarField := f.Scalar()

			// The key requirement here is that we ensure that each case is
			// represented with at the very least a label with a set action on
			// the case output.
			for j, caseNode := range node.Content[i+1].Content {
				jName := strconv.Itoa(j)

				casePath := []string{}
				casePath = append(casePath, path...)
				casePath = append(casePath, fieldName, jName)
				caseTreeNodes, err := yamlFieldToTree(scalarField, casePath, caseNode, prov)
				if err != nil {
					return nil, err
				}

				tmpNodes = append(tmpNodes, &TreeNode{
					Label: fmt.Sprintf("case %v", j),
					// Actions: []NodeAction{
					// 	{
					// 		Operation: "set",
					// 		Path:      sliceToJSONPointer(casePath) + "/output",
					// 		Kind:      "output",
					// 	},
					// },
					Children: caseTreeNodes,
				})
			}
		} else {
			fieldNodes, err := yamlFieldToTree(f, append(path, fieldName), node.Content[i+1], prov)
			if err != nil {
				return nil, err
			}
			tmpNodes = append(tmpNodes, fieldNodes...)
		}
	}

	return tmpNodes, nil
}

func yamlComponentToTrees(
	spec docs.ComponentSpec, path []string, node *yaml.Node, prov docs.Provider,
) (children []*TreeNode, groupedChildren [][]*TreeNode, err error) {
	switch spec.Type {
	case docs.TypeInput, docs.TypeOutput:
		if spec.Name == "switch" {
			children, err = outputSwitchCases(spec.Config.Children, path, node, prov)
			return
		} else if spec.Config.Kind == docs.KindScalar {
			children, err = yamlFieldsToTreeSplitBatching(spec.Config.Children, path, node, prov)
			return
		}
	case docs.TypeProcessor:
		if spec.Name == "switch" || spec.Name == "group_by" {
			eleSpec := spec.Config.Scalar()
			labelPrefix := "case"
			if spec.Name == "group_by" {
				labelPrefix = "group"
			}
			for i, caseNode := range node.Content {
				casePath := make([]string, 0, len(path)+1)
				casePath = append(casePath, path...)
				casePath = append(casePath, strconv.Itoa(i))
				var caseChildren []*TreeNode
				if caseChildren, err = yamlFieldToTree(eleSpec, casePath, caseNode, prov); err != nil {
					return
				}
				caseChildren = append([]*TreeNode{{
					Label: fmt.Sprintf("%v %v", labelPrefix, i),
					// Actions: []NodeAction{
					// 	{
					// 		Operation: "add",
					// 		Path:      sliceToJSONPointer(casePath) + "/processors",
					// 		Kind:      "processor",
					// 	},
					// },
				}}, caseChildren...)
				if len(caseChildren) == 1 {
					complementWithAddFrom(caseChildren[0])
				}
				groupedChildren = append(groupedChildren, caseChildren)
			}
			return
		}
	}
	children, err = yamlFieldToTree(spec.Config, path, node, prov)
	return
}

//------------------------------------------------------------------------------

func unwrapDocumentNode(node *yaml.Node) *yaml.Node {
	if node != nil && node.Kind == yaml.DocumentNode && len(node.Content) > 0 {
		return node.Content[0]
	}
	return node
}
