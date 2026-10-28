// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package rpconnect

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

// GetComponentList returns the bundled schema as the ListComponents response
// body. The mapping mirrors Redpanda Cloud's, so the UI sees the same shape
// (including its losses: only string defaults and examples survive). The
// result is shared; callers must not modify it.
func GetComponentList() (*dataplanev1.ComponentList, error) {
	return componentList()
}

var componentList = sync.OnceValues(func() (*dataplanev1.ComponentList, error) {
	var s schema
	if err := json.Unmarshal(schemaBytes, &s); err != nil {
		return nil, fmt.Errorf("failed to parse redpanda connect schema: %w", err)
	}
	return &dataplanev1.ComponentList{
		// The proto wants semver; `benthos list` reports a "v" prefix.
		Version:           strings.TrimPrefix(s.Version, "v"),
		Buffers:           componentSpecs(s.Buffers),
		Caches:            componentSpecs(s.Caches),
		Inputs:            componentSpecs(s.Inputs),
		Outputs:           componentSpecs(s.Outputs),
		Processors:        componentSpecs(s.Processors),
		RateLimits:        componentSpecs(s.RateLimits),
		Metrics:           componentSpecs(s.Metrics),
		Tracers:           componentSpecs(s.Tracers),
		Scanners:          componentSpecs(s.Scanners),
		BloblangFunctions: bloblangFunctionSpecs(s.BloblangFunctions),
		BloblangMethods:   bloblangMethodSpecs(s.BloblangMethods),
	}, nil
})

// schema is the `benthos list --format json-full-scrubbed` output.
type schema struct {
	Version           string          `json:"version"`
	Buffers           []componentSpec `json:"buffers"`
	Caches            []componentSpec `json:"caches"`
	Inputs            []componentSpec `json:"inputs"`
	Outputs           []componentSpec `json:"outputs"`
	Processors        []componentSpec `json:"processors"`
	RateLimits        []componentSpec `json:"rate-limits"`
	Metrics           []componentSpec `json:"metrics"`
	Tracers           []componentSpec `json:"tracers"`
	Scanners          []componentSpec `json:"scanners"`
	BloblangFunctions []functionSpec  `json:"bloblang-functions"`
	BloblangMethods   []methodSpec    `json:"bloblang-methods"`
}

type componentSpec struct {
	Name        string    `json:"name"`
	Type        string    `json:"type"`
	Status      string    `json:"status"`
	Summary     string    `json:"summary"`
	Description string    `json:"description"`
	Categories  []string  `json:"categories"`
	Footnotes   string    `json:"footnotes"`
	Examples    []example `json:"examples"`
	Config      fieldSpec `json:"config"`
	Version     string    `json:"version"`
}

type example struct {
	Config string `json:"config"`
}

type fieldSpec struct {
	Name             string      `json:"name"`
	Type             string      `json:"type"`
	Kind             string      `json:"kind"`
	Description      string      `json:"description"`
	ShortDescription string      `json:"short_description"`
	IsAdvanced       bool        `json:"is_advanced"`
	IsDeprecated     bool        `json:"is_deprecated"`
	IsOptional       bool        `json:"is_optional"`
	Default          any         `json:"default"`
	Examples         []any       `json:"examples"`
	AnnotatedOptions [][2]string `json:"annotated_options"`
	Children         []fieldSpec `json:"children"`
	Version          string      `json:"version"`
	Interpolated     bool        `json:"interpolated"`
}

type functionSpec struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Status      string            `json:"status"`
	Category    string            `json:"category"`
	Params      params            `json:"params"`
	Examples    []bloblangExample `json:"examples"`
	Version     string            `json:"version"`
}

type methodSpec struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Status      string            `json:"status"`
	Params      params            `json:"params"`
	Examples    []bloblangExample `json:"examples"`
	Categories  []struct {
		Category string `json:"category"`
	} `json:"categories"`
	Version string `json:"version"`
}

type bloblangExample struct {
	Mapping string `json:"mapping"`
}

type params struct {
	Named []struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Type        string `json:"type"`
		Default     any    `json:"default"`
	} `json:"named"`
}

func componentSpecs(in []componentSpec) []*dataplanev1.ComponentSpec {
	out := make([]*dataplanev1.ComponentSpec, 0, len(in))
	for _, c := range in {
		spec := &dataplanev1.ComponentSpec{
			Name:        c.Name,
			Type:        c.Type,
			Status:      componentStatus(c.Status),
			Summary:     c.Summary,
			Description: c.Description,
			Categories:  c.Categories,
			Version:     c.Version,
			Config:      fieldSpecToProto(c.Config),
			Footnotes:   c.Footnotes,
		}
		for _, e := range c.Examples {
			spec.Examples = append(spec.Examples, e.Config)
		}
		out = append(out, spec)
	}
	return out
}

func fieldSpecToProto(f fieldSpec) *dataplanev1.FieldSpec {
	spec := &dataplanev1.FieldSpec{
		Name:             f.Name,
		Type:             f.Type,
		Kind:             f.Kind,
		Description:      f.Description,
		ShortDescription: f.ShortDescription,
		Advanced:         f.IsAdvanced,
		Deprecated:       f.IsDeprecated,
		Optional:         f.IsOptional,
		Version:          f.Version,
		Interpolated:     []string{},
	}
	if d, ok := f.Default.(string); ok {
		spec.DefaultValue = d
	}
	for _, e := range f.Examples {
		if s, ok := e.(string); ok {
			spec.Examples = append(spec.Examples, s)
		}
	}
	if f.Interpolated {
		spec.Interpolated = []string{"true"}
	}
	for _, o := range f.AnnotatedOptions {
		spec.AnnotatedOptions = append(spec.AnnotatedOptions, &dataplanev1.AnnotatedOption{Value: o[0], Description: o[1]})
	}
	for _, c := range f.Children {
		spec.Children = append(spec.Children, fieldSpecToProto(c))
	}
	return spec
}

func bloblangFunctionSpecs(in []functionSpec) []*dataplanev1.BloblangFunctionSpec {
	out := make([]*dataplanev1.BloblangFunctionSpec, 0, len(in))
	for _, f := range in {
		spec := &dataplanev1.BloblangFunctionSpec{
			Name:        f.Name,
			Description: f.Description,
			Status:      f.Status,
			Categories:  []string{f.Category},
			Params:      paramSpec(f.Params),
			Version:     f.Version,
		}
		for _, e := range f.Examples {
			spec.Examples = append(spec.Examples, e.Mapping)
		}
		out = append(out, spec)
	}
	return out
}

func bloblangMethodSpecs(in []methodSpec) []*dataplanev1.BloblangMethodSpec {
	out := make([]*dataplanev1.BloblangMethodSpec, 0, len(in))
	for _, m := range in {
		spec := &dataplanev1.BloblangMethodSpec{
			Name:        m.Name,
			Description: m.Description,
			Status:      m.Status,
			Params:      paramSpec(m.Params),
			Version:     m.Version,
		}
		for _, c := range m.Categories {
			spec.Categories = append(spec.Categories, c.Category)
		}
		for _, e := range m.Examples {
			spec.Examples = append(spec.Examples, e.Mapping)
		}
		out = append(out, spec)
	}
	return out
}

func paramSpec(p params) *dataplanev1.ParamSpec {
	spec := &dataplanev1.ParamSpec{}
	for _, n := range p.Named {
		def := &dataplanev1.ParamDefinition{Name: n.Name, Description: n.Description, Type: n.Type}
		if d, ok := n.Default.(string); ok {
			def.DefaultValue = d
		}
		spec.Definitions = append(spec.Definitions, def)
	}
	return spec
}

func componentStatus(status string) dataplanev1.ComponentStatus {
	switch status {
	case "stable":
		return dataplanev1.ComponentStatus_COMPONENT_STATUS_STABLE
	case "beta":
		return dataplanev1.ComponentStatus_COMPONENT_STATUS_BETA
	case "experimental":
		return dataplanev1.ComponentStatus_COMPONENT_STATUS_EXPERIMENTAL
	case "deprecated":
		return dataplanev1.ComponentStatus_COMPONENT_STATUS_DEPRECATED
	default:
		return dataplanev1.ComponentStatus_COMPONENT_STATUS_UNSPECIFIED
	}
}
