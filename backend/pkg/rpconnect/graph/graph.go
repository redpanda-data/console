package graph

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/benthosdev/benthos/v4/public/service"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"gopkg.in/yaml.v3"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/docs"
	"github.com/redpanda-data/console/backend/pkg/rpconnect/schema"
)

// NodeAction describes an activity that a user can perform on a given node.
type NodeAction struct {
	Operation PatchOperation `json:"operation"`
	Path      string         `json:"path,omitempty"`
	Kind      string         `json:"kind,omitempty"`
}

// TreeNode describes a notable point in the config worth drawing on a graph
// representation. A tree node is usually a component of the config, but can
// also sometimes be a named section.
type TreeNode struct {
	Label           string        `json:"label,omitempty"`
	Path            string        `json:"path"`
	Kind            string        `json:"kind,omitempty"`
	Type            string        `json:"type,omitempty"`
	Children        []*TreeNode   `json:"children,omitempty"`
	GroupedChildren [][]*TreeNode `json:"grouped_children,omitempty"`

	// Actions a user can perform on this node.
	Actions []NodeAction `json:"actions"`
	// Indicates this is an action at the root of a config.
	RootAction bool `json:"root_action"`

	// Information relating back to the config file.
	LineStart  int      `json:"line_start"`
	LineEnd    int      `json:"line_end"`
	LintErrors []string `json:"lint_errors,omitempty"`
}

func complementWithAddFrom(n *TreeNode) {
	childrenOfKind := map[string]struct{}{}
	for _, c := range n.Children {
		childrenOfKind[c.Kind] = struct{}{}
	}
}

type FullSchema struct {
	Version    string               `json:"version"`
	Date       string               `json:"date"`
	Config     docs.FieldSpecs      `json:"config,omitempty"`
	Buffers    []docs.ComponentSpec `json:"buffers,omitempty"`
	Caches     []docs.ComponentSpec `json:"caches,omitempty"`
	Inputs     []docs.ComponentSpec `json:"inputs,omitempty"`
	Outputs    []docs.ComponentSpec `json:"outputs,omitempty"`
	Processors []docs.ComponentSpec `json:"processors,omitempty"`
	RateLimits []docs.ComponentSpec `json:"rate-limits,omitempty"`
	Metrics    []docs.ComponentSpec `json:"metrics,omitempty"`
	Tracers    []docs.ComponentSpec `json:"tracers,omitempty"`
	Scanners   []docs.ComponentSpec `json:"scanners,omitempty"`
	// BloblangFunctions []query.FunctionSpec `json:"bloblang-functions,omitempty"`
	// BloblangMethods   []query.MethodSpec   `json:"bloblang-methods,omitempty"`
}

func providerFromSchema(s *FullSchema) *docs.MappedDocsProvider {
	prov := docs.NewMappedDocsProvider()
	for _, spec := range s.Buffers {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.Caches {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.Inputs {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.Outputs {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.Processors {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.RateLimits {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.Metrics {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.Tracers {
		prov.RegisterDocs(spec)
	}
	for _, spec := range s.Scanners {
		prov.RegisterDocs(spec)
	}
	return prov
}

var sectionActions = map[string][]NodeAction{
	"input": {
		{Operation: PatchAddOp, Path: "/input", Kind: "input"},
	},
	"buffer": {
		{Operation: PatchSetOp, Path: "/buffer", Kind: "buffer"},
	},
	"pipeline": {
		// {Operation: PatchSetOp, Path: "/pipeline/threads", Kind: "int"},
		{Operation: PatchAddOp, Path: "/pipeline/processors", Kind: "processor"},
	},
	"output": {
		{Operation: PatchAddOp, Path: "/output", Kind: "output"},
	},
	"input_resources": {
		{Operation: PatchAddOp, Path: "/input_resources", Kind: "input"},
	},
	"processor_resources": {
		{Operation: PatchAddOp, Path: "/processor_resources", Kind: "processor"},
	},
	"cache_resources": {
		{Operation: PatchAddOp, Path: "/cache_resources", Kind: "cache"},
	},
	"rate_limit_resources": {
		{Operation: PatchAddOp, Path: "/rate_limit_resources", Kind: "rate_limit"},
	},
	"output_resources": {
		{Operation: PatchAddOp, Path: "/output_resources", Kind: "output"},
	},
	"metrics": {
		{Operation: PatchSetOp, Path: "/metrics", Kind: "metrics"},
	},
	"tracer": {
		{Operation: PatchSetOp, Path: "/tracer", Kind: "tracer"},
	},
}

func allocLintsToNode(lints []service.Lint, node *TreeNode) (remaining []service.Lint) {
	if len(lints) == 0 || lints[0].Line > node.LineEnd {
		return lints
	}

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
			return
		}
		node.LintErrors = append(node.LintErrors, lint.What)
	}
	return
}

func addLintsToNodes(streamTree, resourceTree []*TreeNode, lints []service.Lint) {
	if len(lints) == 0 {
		return
	}

	var flatSections []*TreeNode
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

type GraphGenerator struct {
	// We should use the public apis to walk the config schema and views for different fields and stuff
	// for now lets cheat
	// schema *service.ConfigSchema

	schema *FullSchema
	prov   *docs.MappedDocsProvider
}

// NewLinter creates a new Linter instance.
func NewGraphGenerator() (*GraphGenerator, error) {
	// schema, err := service.ConfigSchemaFromJSONV0(schemaBytes)
	var tmpSchema FullSchema
	if err := json.Unmarshal(schema.SchemaBytes, &tmpSchema); err != nil {
		return nil, fmt.Errorf("failed to parse schema: %w", err)
	}

	return &GraphGenerator{
		schema: &tmpSchema,
		prov:   providerFromSchema(&tmpSchema),
	}, nil
}

func (g *GraphGenerator) ConfigToTree(confNode yaml.Node, lints []service.Lint) (streamNodes, resourceNodes []*TreeNode, err error) {
	nodeMap := map[string]yaml.Node{}
	if err = confNode.Decode(&nodeMap); err != nil {
		return
	}

	fieldsMap := map[string]docs.FieldSpec{}
	for _, field := range g.schema.Config {
		fieldsMap[field.Name] = field
	}

	createSection := func(section string) (*TreeNode, bool) {
		tmpTree := &TreeNode{Label: cases.Title(language.English).String(strings.ReplaceAll(section, "_", " "))}
		if section == "pipeline" {
			tmpTree.Label = "Processors"
		}
		if n, exists := nodeMap[section]; exists {
			if tmpTree.Children, err = yamlFieldToTree(fieldsMap[section], []string{section}, &n, g.prov); err != nil {
				return tmpTree, false
			}
			delete(fieldsMap, section)
			if len(tmpTree.Children) > 0 {
				tmpTree.LineStart = tmpTree.Children[0].LineStart
				tmpTree.LineEnd = tmpTree.Children[len(tmpTree.Children)-1].LineEnd
			}
			return tmpTree, len(tmpTree.Children) > 0
		}
		return tmpTree, false
	}

	// Core stream pipeline sections
	for _, section := range []string{
		"input", "buffer", "pipeline", "output",
	} {
		t, hasNodes := createSection(section)
		t.Actions = sectionActions[section]
		complementWithAddFrom(t)
		if hasNodes {
			streamNodes = append(streamNodes, t)
		} else {
			t.RootAction = true
			if section == "buffer" {
				resourceNodes = append(resourceNodes, t)
			} else {
				streamNodes = append(streamNodes, t)
			}
		}
	}

	// // Observability sections
	// for _, section := range []string{
	// 	"metrics", "tracer",
	// } {
	// 	t, hasNodes := createSection(section)
	// 	// t.Actions = sectionActions[section]
	// 	complementWithAddFrom(t)
	// 	if !hasNodes {
	// 		continue
	// 		// TODO: Re-enable this once the graph view is formatted nicerly
	// 		// t.RootAction = true
	// 	}
	// 	// observabilityNodes = append(observabilityNodes, t)
	// }

	// Remaining sections (resources)
	sectionKeys := []string{}
	for k := range fieldsMap {
		sectionKeys = append(sectionKeys, k)
	}
	sort.Strings(sectionKeys)

	tmpResourceSections := resourceNodes
	resourceNodes = nil

	for _, section := range sectionKeys {
		if t, ok := createSection(section); ok {
			t.Actions = sectionActions[section]
			// No need to reorder resource children
			for _, resChild := range t.Children {
				var newActions []NodeAction
				for _, a := range resChild.Actions {
					if !strings.HasPrefix(string(a.Operation), "move ") {
						newActions = append(newActions, a)
					}
				}
				resChild.Actions = newActions
			}
			resourceNodes = append(resourceNodes, t)
		}
	}
	resourceNodes = append(resourceNodes, tmpResourceSections...)

	generalResourceNode := &TreeNode{
		Label:      "Resources",
		RootAction: true,
	}
	for k, v := range sectionActions {
		if strings.HasSuffix(k, "resources") {
			generalResourceNode.Actions = append(generalResourceNode.Actions, v...)
		}
	}
	sort.Slice(generalResourceNode.Actions, func(i, j int) bool {
		return generalResourceNode.Actions[i].Kind < generalResourceNode.Actions[j].Kind
	})
	complementWithAddFrom(generalResourceNode)
	resourceNodes = append(resourceNodes, generalResourceNode)

	addLintsToNodes(streamNodes, resourceNodes, lints)
	return
}
