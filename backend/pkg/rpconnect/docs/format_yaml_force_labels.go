package docs

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
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

func yamlFieldForceLabel(field FieldSpec, cpath []string, node *yaml.Node, prov Provider) error {
	node = unwrapDocumentNode(node)

	switch field.Kind {
	case Kind2DArray:
		field = field.Array()
		for i := 0; i < len(node.Content); i++ {
			if err := yamlFieldForceLabel(field, append(cpath, strconv.Itoa(i)), node.Content[i], prov); err != nil {
				return err
			}
		}
		return nil
	case KindArray:
		field = field.Scalar()
		for i := 0; i < len(node.Content); i++ {
			if err := yamlFieldForceLabel(field, append(cpath, strconv.Itoa(i)), node.Content[i], prov); err != nil {
				return err
			}
		}
		return nil
	case KindMap:
		field = field.Scalar()
		for i := 0; i < len(node.Content)-1; i += 2 {
			if err := yamlFieldForceLabel(field, append(cpath, node.Content[i].Value), node.Content[i+1], prov); err != nil {
				return err
			}
		}
		return nil
	}

	if coreType, is := field.Type.IsCoreComponent(); is {
		_, spec, err := GetInferenceCandidateFromYAML(prov, coreType, node)
		if err != nil {
			return err
		}

		_, needsLabel := map[Type]struct{}{
			TypeInput:     {},
			TypeProcessor: {},
			TypeOutput:    {},
		}[coreType]
		label := sliceToJSONPointer(cpath)

		reserved := ReservedFieldsByType(coreType)
		for i := 0; i < len(node.Content)-1; i += 2 {
			if node.Content[i].Value == "label" {
				if node.Content[i+1].Value == "" {
					node.Content[i+1].Value = label
				}
				label = ""
			}
			if f, exists := reserved[node.Content[i].Value]; exists {
				if err := yamlFieldForceLabel(f, append(cpath, f.Name), node.Content[i+1], prov); err != nil {
					return err
				}
			}
			if node.Content[i].Value == spec.Name {
				if err := yamlFieldForceLabel(spec.Config, append(cpath, spec.Name), node.Content[i+1], prov); err != nil {
					return err
				}
			}
		}

		if needsLabel && label != "" {
			var keyNode, valueNode yaml.Node
			if err := keyNode.Encode("label"); err != nil {
				return err
			}
			if err := valueNode.Encode(label); err != nil {
				return err
			}
			node.Content = append(node.Content, unwrapDocumentNode(&keyNode), unwrapDocumentNode(&valueNode))
		}
		return nil
	}
	if len(field.Children) > 0 {
		return YAMLFieldsForceLabel(field.Children, cpath, node, prov)
	}
	return nil
}

// YAMLFieldsForceLabel walks a YAML config and for each component input,
// processor or output adds a label containing the JSON pointer to it in the
// config if there is not already one present. This is useful in situations
// where you're extracting information from nodes and need to be able to
// associate labelled results back to the node on the config tree.
func YAMLFieldsForceLabel(fields FieldSpecs, path []string, node *yaml.Node, prov Provider) error {
	node = unwrapDocumentNode(node)

	fieldsMap := map[string]FieldSpec{}
	for _, field := range fields {
		fieldsMap[field.Name] = field
	}

	for i := 0; i < len(node.Content)-1; i += 2 {
		fieldName := node.Content[i].Value

		if f, exists := fieldsMap[fieldName]; exists {
			if err := yamlFieldForceLabel(f, append(path, fieldName), node.Content[i+1], prov); err != nil {
				return err
			}
		}
	}
	return nil
}

// YAMLConfigForceLabels walks a YAML config and for each component input,
// processor or output adds a label containing the JSON pointer to it in the
// config if there is not already one present. This is useful in situations
// where you're extracting information from nodes and need to be able to
// associate labelled results back to the node on the config tree.
func YAMLConfigForceLabels(fields FieldSpecs, config string, prov Provider) (*yaml.Node, error) {
	var node yaml.Node
	if err := yaml.Unmarshal([]byte(config), &node); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	rootNode := unwrapDocumentNode(&node)
	if err := YAMLFieldsForceLabel(fields, nil, rootNode, prov); err != nil {
		return nil, fmt.Errorf("failed to inject labels: %w", err)
	}

	return rootNode, nil
}
