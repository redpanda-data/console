// Package tree provides utilities for converting YAML configs into a tree,
// where each branch represents a component within the config.
package tree

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/redpanda-data/benthos/v4/public/service"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/schema"
)

// Node describes a notable point in the config worth representing on a tree
// representation. A tree node is usually a component of the config, but can
// also sometimes be a named section (without a Kind).
type Node struct {
	Label           string    `json:"label,omitempty"`
	Path            string    `json:"path"`
	Kind            string    `json:"kind,omitempty"`
	Type            string    `json:"type,omitempty"`
	Children        []*Node   `json:"children,omitempty"`
	GroupedChildren [][]*Node `json:"grouped_children,omitempty"`

	// Information relating back to the config file.
	LineStart  int      `json:"line_start"`
	LineEnd    int      `json:"line_end"`
	LintErrors []string `json:"lint_errors,omitempty"`
}

func allocLintsToNode(lints []service.Lint, node *Node) []service.Lint {
	if len(lints) == 0 || lints[0].Line > node.LineEnd {
		return lints
	}

	var remaining []service.Lint

	tmpChildren := node.Children
	if len(node.GroupedChildren) > 0 {
		tmpChildren = nil
		for _, group := range node.GroupedChildren {
			tmpChildren = append(tmpChildren, group...)
		}
		sort.Slice(tmpChildren, func(i, j int) bool {
			return tmpChildren[i].LineStart < tmpChildren[j].LineStart
		})
	}
	for _, child := range tmpChildren {
		lints = allocLintsToNode(lints, child)
	}

	for i, lint := range lints {
		if lint.Line < node.LineStart {
			remaining = append(remaining, lint)
			continue
		}
		if lint.Line > node.LineEnd {
			remaining = append(remaining, lints[i:]...)
			return remaining
		}
		node.LintErrors = append(node.LintErrors, lint.What)
	}

	return remaining
}

func addLintsToNodes(streamTree, resourceTree []*Node, lints []service.Lint) {
	if len(lints) == 0 {
		return
	}

	var flatSections []*Node
	for _, node := range streamTree {
		flatSections = append(flatSections, node.Children...)
	}
	for _, node := range resourceTree {
		flatSections = append(flatSections, node.Children...)
	}

	sort.Slice(lints, func(i, j int) bool {
		return lints[i].Line < lints[j].Line
	})
	sort.Slice(flatSections, func(i, j int) bool {
		return flatSections[i].LineStart < flatSections[j].LineStart
	})

	for _, section := range flatSections {
		if lints = allocLintsToNode(lints, section); len(lints) == 0 {
			return
		}
	}
}

// Generator is used to generate graph
type Generator struct {
	walker *service.StreamConfigWalker
	schema *service.ConfigSchema
}

// NewGenerator creates a new graph generator instance.
func NewGenerator() (*Generator, error) {
	schema, err := service.ConfigSchemaFromJSONV0(schema.SchemaBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse schema: %w", err)
	}

	return &Generator{
		walker: schema.NewStreamConfigWalker(),
		schema: schema,
	}, nil
}

// ConfigToTree converts config to a graph tree.
func (g *Generator) ConfigToTree(config []byte, lints []service.Lint) (streamNodes []*Node, resourceNodes []*Node, err error) {
	var tmpSlice []*Node
	if err := g.walker.WalkComponentsYAML(config, componentWalker(&tmpSlice)); err != nil {
		return nil, nil, err
	}

	tmpl, err := g.schema.TemplateData()
	if err != nil {
		return nil, nil, err
	}

	coreSections := map[string][]*Node{}
	for _, child := range tmpSlice {
		corePrefix := strings.Split(child.Path, "/")[1]
		coreSections[corePrefix] = append(coreSections[corePrefix], child)
	}

	for _, f := range tmpl.Fields {
		key := f.FullName
		s, exists := coreSections[key]
		if !exists {
			continue
		}

		tmpTree := &Node{
			Label:    cases.Title(language.English).String(strings.ReplaceAll(key, "_", " ")),
			Children: s,
		}

		if _, exists := map[string]struct{}{
			"input": {}, "buffer": {}, "pipeline": {}, "output": {},
		}[key]; exists {
			if key == "pipeline" {
				tmpTree.Label = "Processors"
			}
			streamNodes = append(streamNodes, tmpTree)
		} else {
			resourceNodes = append(resourceNodes, tmpTree)
		}

		if len(tmpTree.Children) > 0 {
			tmpTree.LineStart = tmpTree.Children[0].LineStart
			tmpTree.LineEnd = tmpTree.Children[len(tmpTree.Children)-1].LineEnd
		}
	}

	addLintsToNodes(streamNodes, resourceNodes, lints)
	return streamNodes, resourceNodes, err
}

var componentWalker func(slice *[]*Node) func(w *service.WalkedComponent) error

const (
	batchingProcessorLabel = "batching processors"

	inputKind     = "input"
	processorKind = "processor"
	outputKind    = "output"
)

func moveBatchingProcs(w *service.WalkedComponent, children *[]*Node) {
	batchingFieldPrefix := w.PathAsJSONPointer() + "/" + w.Name + "/batching"

	var batchFields []*Node
	for i, child := range *children {
		if strings.HasPrefix(child.Path, batchingFieldPrefix) {
			batchFields = append(batchFields, child)
			(*children)[i] = nil
		}
	}
	if len(batchFields) == 0 {
		return
	}

	newSlice := make([]*Node, 0, len(*children)-len(batchFields)+1)

	if w.ComponentType == inputKind {
		// Batching node comes first
		newSlice = append(newSlice, &Node{
			Label:    batchingProcessorLabel,
			Children: batchFields,
		})
	}

	for _, c := range *children {
		if c != nil {
			newSlice = append(newSlice, c)
		}
	}

	if w.ComponentType == outputKind {
		// Batching node comes last
		newSlice = append(newSlice, &Node{
			Label:    batchingProcessorLabel,
			Children: batchFields,
		})
	}

	*children = newSlice
}

func moveSwitchProcCases(path string, children []*Node, groupedChildren *[][]*Node) {
	groups := map[int][]*Node{}
	highestIndex := 0

	casePrefix := path + "/switch/"
	for _, c := range children {
		indexStr := strings.TrimPrefix(c.Path, casePrefix)
		indexStr = strings.Split(indexStr, "/")[0]
		index, _ := strconv.Atoi(indexStr) // Zero by default in failure cases is fine

		if index > highestIndex {
			highestIndex = index
		}
		groups[index] = append(groups[index], c)
	}

	*groupedChildren = make([][]*Node, highestIndex+1)
	for i := range *groupedChildren {
		(*groupedChildren)[i] = append([]*Node{{
			Label: "case " + strconv.Itoa(i),
		}}, groups[i]...)
	}
}

func moveGroupByProcCases(path string, children []*Node, groupedChildren *[][]*Node) {
	groups := map[int][]*Node{}
	highestIndex := 0

	casePrefix := path + "/group_by/"
	for _, c := range children {
		indexStr := strings.TrimPrefix(c.Path, casePrefix)
		indexStr = strings.Split(indexStr, "/")[0]
		index, _ := strconv.Atoi(indexStr) // Zero by default in failure cases is fine

		if index > highestIndex {
			highestIndex = index
		}
		groups[index] = append(groups[index], c)
	}

	*groupedChildren = make([][]*Node, highestIndex+1)
	for i := range *groupedChildren {
		(*groupedChildren)[i] = append([]*Node{{
			Label: "group " + strconv.Itoa(i),
		}}, groups[i]...)
	}
}

func moveSwitchOutputCases(path string, children *[]*Node, groupedChildren *[][]*Node) {
	groups := map[int][]*Node{}
	highestIndex := 0

	casePrefix := path + "/switch/cases/"
	for i, c := range *children {
		if !strings.HasPrefix(c.Path, casePrefix) {
			continue
		}

		indexStr := strings.TrimPrefix(c.Path, casePrefix)
		indexStr = strings.Split(indexStr, "/")[0]
		index, _ := strconv.Atoi(indexStr) // Zero by default in failure cases is fine

		if index > highestIndex {
			highestIndex = index
		}
		groups[index] = append(groups[index], c)

		(*children)[i] = nil
	}

	var tmpRemaining []*Node
	for i := 0; i < highestIndex+1; i++ {
		tmpRemaining = append(tmpRemaining, &Node{
			Label:    "case " + strconv.Itoa(i),
			Children: groups[i],
		})
	}
	for _, c := range *children {
		if c != nil {
			tmpRemaining = append(tmpRemaining, c)
		}
	}

	*children = tmpRemaining
}

func componentChildrenWalker(children *[]*Node, groupedChildren *[][]*Node) func(w *service.WalkedComponent) error {
	return func(w *service.WalkedComponent) error {
		var tmpChildren []*Node
		if err := w.WalkComponentsYAML(componentWalker(&tmpChildren)); err != nil && !errors.Is(err, service.ErrSkipComponents) {
			return err
		}
		if len(tmpChildren) == 0 {
			return service.ErrSkipComponents
		}

		jpPath := w.PathAsJSONPointer()

		// A series of custom rules for fields under a component that we'd like
		// to present in a specific way. Ultimately, these are all optional and
		// only a "best attempt" to tidy up the tree with sub-headers.
		moveBatchingProcs(w, &tmpChildren)

		switch {
		case w.ComponentType == processorKind && w.Name == "switch":
			moveSwitchProcCases(jpPath, tmpChildren, groupedChildren)

		case w.ComponentType == processorKind && w.Name == "group_by":
			moveGroupByProcCases(jpPath, tmpChildren, groupedChildren)

		case w.ComponentType == outputKind && w.Name == "switch":
			moveSwitchOutputCases(jpPath, &tmpChildren, groupedChildren)
			*children = tmpChildren

		default:
			*children = tmpChildren
		}

		return service.ErrSkipComponents
	}
}

func init() {
	componentWalker = func(slice *[]*Node) func(w *service.WalkedComponent) error {
		return func(w *service.WalkedComponent) error {
			tnode := &Node{
				Label:     w.Label,
				Path:      w.PathAsJSONPointer(),
				Kind:      w.ComponentType,
				Type:      w.Name,
				LineStart: w.LineStart,
				LineEnd:   w.LineEnd,
			}

			if w.ComponentType == processorKind && w.Name == "resource" {
				if v, err := w.ConfigAny(); err == nil {
					if tmpObj, ok := v.(map[string]any); ok {
						if tmpRes, ok := tmpObj["resource"].(string); ok {
							tnode.Label = tmpRes
						}
					}
				}
			}

			if err := componentChildrenWalker(&tnode.Children, &tnode.GroupedChildren)(w); err != nil && !errors.Is(err, service.ErrSkipComponents) {
				return err
			}

			*slice = append(*slice, tnode)
			return service.ErrSkipComponents
		}
	}
}
