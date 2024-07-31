// Package graph provides utility to for converting YAML spec to graph
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

	// Information relating back to the config file.
	LineStart  int      `json:"line_start"`
	LineEnd    int      `json:"line_end"`
	LintErrors []string `json:"lint_errors,omitempty"`
}

type fullSchema struct {
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

func providerFromSchema(s *fullSchema) *docs.MappedDocsProvider {
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

func allocLintsToNode(lints []service.Lint, node *TreeNode) []service.Lint {
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

// Generator is used to generate graph
type Generator struct {
	// We should use the public apis to walk the config schema and views for different fields and stuff
	// for now lets cheat
	// schema *service.ConfigSchema

	schema *fullSchema
	prov   *docs.MappedDocsProvider
}

// NewGenerator creates a new graph generator instance.
func NewGenerator() (*Generator, error) {
	var tmpSchema fullSchema
	if err := json.Unmarshal(schema.SchemaBytes, &tmpSchema); err != nil {
		return nil, fmt.Errorf("failed to parse schema: %w", err)
	}

	return &Generator{
		schema: &tmpSchema,
		prov:   providerFromSchema(&tmpSchema),
	}, nil
}

// ConfigToTree converts config to a graph tree.
func (g *Generator) ConfigToTree(confNode yaml.Node, lints []service.Lint) ([]*TreeNode, []*TreeNode, error) {
	var streamNodes, resourceNodes []*TreeNode
	nodeMap := map[string]yaml.Node{}
	if err := confNode.Decode(&nodeMap); err != nil {
		return streamNodes, resourceNodes, err
	}

	fieldsMap := map[string]docs.FieldSpec{}
	for _, field := range g.schema.Config {
		fieldsMap[field.Name] = field
	}
	createSection := func(section string) (*TreeNode, bool) {
		var err error
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
		if t, hasNodes := createSection(section); hasNodes {
			streamNodes = append(streamNodes, t)
		}
	}

	// Remaining sections (resources)
	sectionKeys := []string{}
	for k := range fieldsMap {
		sectionKeys = append(sectionKeys, k)
	}
	sort.Strings(sectionKeys)

	for _, section := range sectionKeys {
		if t, ok := createSection(section); ok {
			resourceNodes = append(resourceNodes, t)
		}
	}

	addLintsToNodes(streamNodes, resourceNodes, lints)
	return streamNodes, resourceNodes, nil
}
