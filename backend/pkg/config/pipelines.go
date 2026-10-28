// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"errors"
	"fmt"
	"strings"

	"k8s.io/apimachinery/pkg/util/validation"
)

// Pipelines configures where Console reads and writes Redpanda Connect pipelines.
// It's a top-level key because the enterprise build already owns `redpandaConnect`.
type Pipelines struct {
	Kubernetes PipelinesKubernetes `yaml:"kubernetes"`
}

// Validate the pipelines configuration.
func (c *Pipelines) Validate() error {
	return c.Kubernetes.Validate()
}

// PipelinesKubernetes serves the PipelineService from Redpanda Operator
// Pipeline custom resources (pipelines.cluster.redpanda.com).
type PipelinesKubernetes struct {
	Enabled bool `yaml:"enabled"`
	// Namespace is the only namespace Console reads and writes Pipeline CRs in.
	Namespace string `yaml:"namespace"`
	// ClusterRef is written to spec.cluster.clusterRef.name on every pipeline
	// Console writes. Requires UserRef unless AllowBootstrapUser is set.
	ClusterRef string `yaml:"clusterRef"`
	// UserRef is the User CR (same namespace) that Console-managed pipelines
	// authenticate to the cluster as. It's written to spec.userRef.name on
	// every write; requests can't choose the user.
	UserRef string `yaml:"userRef"`
	// AllowBootstrapUser allows ClusterRef without UserRef. The operator then
	// runs pipelines as the cluster's bootstrap superuser if SASL is enabled.
	AllowBootstrapUser bool `yaml:"allowBootstrapUser"`
	// ImpersonateUser sends the logged-in user's OIDC ID token to the
	// Kubernetes API as the bearer token, instead of Console's ServiceAccount
	// token. It isn't Kubernetes impersonation (Impersonate-User headers).
	ImpersonateUser bool `yaml:"impersonateUser"`
	// AllowUnauthenticated allows enabling pipelines without a Console login.
	// Anyone who can reach Console can then run workloads in the cluster.
	AllowUnauthenticated bool `yaml:"allowUnauthenticated"`
	// SkipAdmissionCheck skips the startup check that the operator's
	// ValidatingAdmissionPolicy for Console is installed (ServiceAccount mode).
	SkipAdmissionCheck bool `yaml:"skipAdmissionCheck"`

	// authenticationEnabled is set by the build that serves the login (see
	// SetAuthenticationEnabled); OSS Console has none.
	authenticationEnabled bool
}

// SetAuthenticationEnabled tells Validate whether Console requires a login
// (for example OIDC or basic auth in Console Enterprise). Without one,
// enabling pipelines requires AllowUnauthenticated.
func (c *PipelinesKubernetes) SetAuthenticationEnabled(enabled bool) {
	c.authenticationEnabled = enabled
}

// Validate the Kubernetes pipelines configuration.
func (c *PipelinesKubernetes) Validate() error {
	if !c.Enabled {
		return nil
	}
	if !c.authenticationEnabled && !c.AllowUnauthenticated {
		return errors.New("pipelines.kubernetes.enabled lets every Console user create workloads in the cluster, " +
			"but Console has no authentication method enabled, so that is anyone who can reach Console: " +
			"enable an authentication method (OIDC or basic, Console Enterprise) or set " +
			"pipelines.kubernetes.allowUnauthenticated: true to accept that risk")
	}
	if c.Namespace == "" {
		return errors.New("pipelines.kubernetes.namespace is required when pipelines.kubernetes.enabled is true")
	}
	if errs := validation.IsDNS1123Label(c.Namespace); len(errs) > 0 {
		return fmt.Errorf("invalid pipelines.kubernetes.namespace %q: %s", c.Namespace, strings.Join(errs, "; "))
	}
	if c.ClusterRef != "" {
		if errs := validation.IsDNS1123Subdomain(c.ClusterRef); len(errs) > 0 {
			return fmt.Errorf("invalid pipelines.kubernetes.clusterRef %q: %s", c.ClusterRef, strings.Join(errs, "; "))
		}
	}
	if c.UserRef != "" {
		if errs := validation.IsDNS1123Subdomain(c.UserRef); len(errs) > 0 {
			return fmt.Errorf("invalid pipelines.kubernetes.userRef %q: %s", c.UserRef, strings.Join(errs, "; "))
		}
	}
	// Without a userRef, the operator runs cluster-bound pipelines as the
	// cluster's bootstrap superuser.
	if c.ClusterRef != "" && c.UserRef == "" && !c.AllowBootstrapUser {
		return errors.New("pipelines.kubernetes.clusterRef requires pipelines.kubernetes.userRef: " +
			"set pipelines.kubernetes.userRef to a User with ACLs scoped to Console's pipelines, " +
			"or set pipelines.kubernetes.allowBootstrapUser: true for clusters without SASL")
	}
	return nil
}
