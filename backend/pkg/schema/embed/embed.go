// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package embed

import (
	"embed"
	"io/fs"
	"path/filepath"
	"sync"
)

//go:embed all:protobuf
var Content embed.FS

var (
	once     sync.Once
	protoMap map[string]string
)

func CommonProtoFiles() (fs.FS, error) {
	return fs.Sub(Content, "protobuf")
}

func CommonProtoFileMap() (map[string]string, error) {
	protoFS, err := CommonProtoFiles()
	if err != nil {
		return nil, err
	}

	once.Do(func() {
		protoMap = make(map[string]string)
		err = fs.WalkDir(protoFS, ".", func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}

			if d.IsDir() {
				return nil
			}

			if filepath.Ext(path) == ".proto" {
				data, err := fs.ReadFile(protoFS, path)
				if err == nil {
					protoMap[path] = string(data)
				}
			}

			return nil
		})
	})

	if err != nil {
		return nil, err
	}

	return protoMap, err
}
