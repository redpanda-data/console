// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package transform

import (
	"net/http"
)

// HandleDeployTransform is the HTTP handler for deploying WASM transforms in Redpanda.
// Because we use multipart/form-data for uploading the binary file (up to 50mb), we did
// not use gRPC/protobuf for this.
func (s *Service) HandleDeployTransform() http.HandlerFunc {
	return s.targetImpl.HandleDeployTransform()
}
