// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kubernetes

import "context"

// TODO: console-enterprise must call kubernetes.ContextWithUserName and
// kubernetes.ContextWithUserToken on requests that reach Kubernetes-backed
// services; until then audit logs and annotations carry no user, and
// impersonateUser mode rejects every request. Tracked in
// redpanda-data/console#2697.

type (
	userTokenKey struct{}
	userNameKey  struct{}
)

// ContextWithUserToken stores the logged-in user's OIDC ID token for
// impersonateUser mode, where it's sent to the Kubernetes API as the bearer
// token. OSS Console holds no IdP tokens, so the auth layer (enterprise login)
// must set it on every request that reaches a Kubernetes-backed service.
func ContextWithUserToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, userTokenKey{}, token)
}

// UserTokenFromContext returns the token set by ContextWithUserToken.
func UserTokenFromContext(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(userTokenKey{}).(string)
	return token, ok && token != ""
}

// ContextWithUserName stores the logged-in user's display identity, used for
// audit logs and annotations on objects Console creates.
func ContextWithUserName(ctx context.Context, name string) context.Context {
	return context.WithValue(ctx, userNameKey{}, name)
}

// UserNameFromContext returns the identity set by ContextWithUserName.
func UserNameFromContext(ctx context.Context) (string, bool) {
	name, ok := ctx.Value(userNameKey{}).(string)
	return name, ok && name != ""
}
