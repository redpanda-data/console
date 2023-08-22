// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build !windows

package filesystem

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
)

type FileSystemTestSuite struct {
	suite.Suite

	cfg              config.Filesystem
	log              *zap.Logger
	workingDirectory string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &FileSystemTestSuite{})
}

func (*FileSystemTestSuite) createBaseConfig() config.Filesystem {
	cfg := config.Filesystem{}
	cfg.SetDefaults()
	cfg.Enabled = true
	cfg.RefreshInterval = 1 * time.Minute
	cfg.Paths = []string{"testdata"}
	cfg.AllowedFileExtensions = []string{"txt"}

	return cfg
}

func (s *FileSystemTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	os.Mkdir("testdata", 0o750)
	os.Create("testdata/visible.txt")
	os.Create("testdata/.hidden.txt")

	os.Mkdir("testdata/..hiddenFolder", 0o750)
	os.Create("testdata/..hiddenFolder/visible.txt")
	os.Create("testdata/..hiddenFolder/.hidden.txt")

	os.Mkdir("testdata/visibleFolder", 0o750)
	os.Create("testdata/visibleFolder/visible.txt")
	os.Create("testdata/visibleFolder/.hidden.txt")

	dir, err := os.Getwd()
	require.NoError(err)
	s.workingDirectory = dir

	s.cfg = s.createBaseConfig()

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	s.log = log
}

func (*FileSystemTestSuite) TearDownSuite() {
	os.RemoveAll("testdata")
}

func (s *FileSystemTestSuite) TestReadingFiles() {
	t := s.T()

	t.Run("skip hidden files", func(t *testing.T) {
		assert := require.New(t)

		s.cfg.SkipHiddenFiles = true

		svc, _ := NewService(s.cfg, s.log, nil)

		svc.Start()

		files := svc.GetFilesByFilename()

		assert.Equal(2, len(files))
		assert.Contains(files, s.workingDirectory+"/testdata/visible")
		assert.Contains(files, s.workingDirectory+"/testdata/visibleFolder/visible")
	})

	t.Run("load hidden files", func(t *testing.T) {
		assert := require.New(t)

		s.cfg.SkipHiddenFiles = false

		svc, _ := NewService(s.cfg, s.log, nil)

		svc.Start()

		files := svc.GetFilesByFilename()

		assert.Equal(6, len(files))
		assert.Contains(files, s.workingDirectory+"/testdata/visible")
		assert.Contains(files, s.workingDirectory+"/testdata/.hidden")
		assert.Contains(files, s.workingDirectory+"/testdata/visibleFolder/visible")
		assert.Contains(files, s.workingDirectory+"/testdata/visibleFolder/.hidden")
		assert.Contains(files, s.workingDirectory+"/testdata/..hiddenFolder/visible")
		assert.Contains(files, s.workingDirectory+"/testdata/..hiddenFolder/.hidden")
	})
}
