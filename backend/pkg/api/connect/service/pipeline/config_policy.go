// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package pipeline

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"maps"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// deniedComponents run binaries, read or write files in the pipeline pod
// (including its ServiceAccount token), or accept connections into it.
var deniedComponents = []string{"command", "subprocess", "file", "socket_server"}

// deniedBloblang matches calls to Bloblang functions that read the pod's
// environment or files. Bloblang allows no space between a function name and
// "(", and a preceding identifier character makes it a different name.
var deniedBloblang = regexp.MustCompile(`(?:^|[^a-z0-9_])(env|file|file_rel)\(`)

// deniedEnvPrefixes are the env vars the operator sets in the pipeline pod,
// including REDPANDA_SASL_PASSWORD.
var deniedEnvPrefixes = []string{"${REDPANDA_", "${RPK_"}

// Mirrors Redpanda Connect's env var interpolation: ${NAME}, ${NAME:default},
// and an optional |function suffix.
var (
	envVarRegex        = regexp.MustCompile(`\${[0-9A-Za-z_.]+(:((\${[^}]+})|[^}])*)?(?:\|[0-9A-Za-z]+)?}`)
	escapedEnvVarRegex = regexp.MustCompile(`\${({[0-9A-Za-z_.]+(:((\${[^}]+})|[^}])*)?})}`)
)

// checkConfigPolicy rejects pipeline configs that reach outside the pipeline:
// the components in deniedComponents, the Bloblang functions env(), file(),
// and file_rel(), and the operator's REDPANDA_* and RPK_* env vars.
//
// It's a denylist with known limits:
//   - Component names are matched as map keys anywhere in the config, after
//     env var interpolation with defaults. A key whose value is a scalar (such
//     as the redis processor's `command: incrby`) is allowed.
//   - Bloblang calls and env var prefixes are matched as case-sensitive text,
//     so they're also rejected in comments and string literals.
//
// It doesn't make pipeline authors untrusted: a pipeline can still reach the
// network and act as the identity the operator gives it (userRef).
func checkConfigPolicy(configYAML string) error {
	expanded, err := expandEnvVars(configYAML)
	if err != nil {
		return newInvalidArgument("config_yaml", fmt.Sprintf("failed to interpolate environment variables: %v", err))
	}
	for _, prefix := range deniedEnvPrefixes {
		if strings.Contains(configYAML, prefix) || strings.Contains(expanded, prefix) {
			return newInvalidArgument("config_yaml", fmt.Sprintf(
				"pipeline config references %s...}; Console-managed pipelines can't read the environment variables the operator sets", prefix))
		}
	}
	if m := deniedBloblang.FindStringSubmatch(expanded); m != nil {
		return newInvalidArgument("config_yaml", fmt.Sprintf(
			"pipeline config calls the Bloblang function %s(); Console-managed pipelines can't use env(), file(), or file_rel()", m[1]))
	}

	dec := yaml.NewDecoder(strings.NewReader(expanded))
	for {
		var doc any
		if err := dec.Decode(&doc); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return newInvalidArgument("config_yaml", fmt.Sprintf("failed to parse pipeline config: %v", err))
		}
		if name, path := findDeniedComponent(doc, ""); name != "" {
			return newInvalidArgument("config_yaml", fmt.Sprintf(
				"pipeline config uses the %s component at %s; Console-managed pipelines can't use %s",
				name, path, strings.Join(deniedComponents, ", ")))
		}
	}
}

// findDeniedComponent returns the first denied component name used as a map
// key with a non-scalar value, and its path.
func findDeniedComponent(v any, path string) (name, at string) {
	switch t := v.(type) {
	case map[string]any:
		for _, k := range slices.Sorted(maps.Keys(t)) {
			if name, at := checkKey(k, t[k], path); name != "" {
				return name, at
			}
		}
	case map[any]any:
		for k, child := range t {
			if name, at := checkKey(fmt.Sprint(k), child, path); name != "" {
				return name, at
			}
		}
	case []any:
		for i, child := range t {
			if name, at := findDeniedComponent(child, path+"["+strconv.Itoa(i)+"]"); name != "" {
				return name, at
			}
		}
	}
	return "", ""
}

func checkKey(key string, value any, parent string) (name, at string) {
	path := key
	if parent != "" {
		path = parent + "." + key
	}
	if slices.Contains(deniedComponents, key) && !isScalar(value) {
		return key, path
	}
	return findDeniedComponent(value, path)
}

// isScalar reports whether v is a YAML scalar other than null. Components are
// configured with a mapping, and `file:` alone (null) still selects one.
func isScalar(v any) bool {
	switch v.(type) {
	case nil, map[string]any, map[any]any, []any:
		return false
	default:
		return true
	}
}

// expandEnvVars interpolates env vars the way Redpanda Connect does, with
// every variable unset: ${NAME} becomes empty and ${NAME:default} its default.
// The pod's actual values aren't set by pipeline authors, so this is the text
// an author controls.
func expandEnvVars(in string) (string, error) {
	var errs []error
	out := envVarRegex.ReplaceAllStringFunc(in, func(match string) string {
		spec := match[2 : len(match)-1]
		colon := strings.IndexByte(spec, ':')
		if colon == -1 {
			// No default: an unset variable is empty, and functions of "" are "".
			return ""
		}
		value, fn := spec[colon+1:], ""
		if pipe := strings.LastIndexByte(value, '|'); pipe != -1 {
			value, fn = value[:pipe], value[pipe+1:]
		}
		switch fn {
		case "":
		case "base64decode":
			decoded, err := base64.StdEncoding.DecodeString(value)
			if err != nil {
				errs = append(errs, fmt.Errorf("failed to decode base64-encoded default of %s: %w", match, err))
				return ""
			}
			value = string(decoded)
		default:
			errs = append(errs, fmt.Errorf("unknown env var decode function %q", fn))
			return ""
		}
		return strings.ReplaceAll(value, "\n", `\n`)
	})
	if len(errs) > 0 {
		return "", errors.Join(errs...)
	}
	return string(escapedEnvVarRegex.ReplaceAll([]byte(out), []byte("$$$1"))), nil
}
