// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package git

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/go-git/go-billy/v5"
	"github.com/go-git/go-billy/v5/memfs"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/transport"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/go-git/go-git/v5/plumbing/transport/ssh"
	"github.com/go-git/go-git/v5/storage/memory"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/filesystem"
)

// Service provides functionality to serve files from a git repository. The contents are stored in memory.
type Service struct {
	Cfg    config.Git
	auth   transport.AuthMethod
	logger *zap.Logger

	// TopicDocumentation in memory git
	memFs billy.Filesystem
	repo  *git.Repository

	// In memory cache for markdowns. Map key is the filename with stripped ".md" suffix.
	filesByName map[string]filesystem.File
	mutex       sync.RWMutex

	OnFilesUpdatedHook func()
}

// NewService creates a new Git service with preconfigured Auth
func NewService(cfg config.Git, logger *zap.Logger, onFilesUpdatedHook func()) (*Service, error) {
	childLogger := logger.With(zap.String("repository_url", cfg.Repository.URL))

	var auth transport.AuthMethod
	var err error
	switch {
	case cfg.SSH.Enabled:
		childLogger.Debug("using SSH for Git authentication")
		auth, err = buildSshAuth(cfg.SSH)
	case cfg.BasicAuth.Enabled:
		childLogger.Debug("using BasicAuth for Git authentication")
		auth = buildBasicAuth(cfg.BasicAuth)
	default:
		childLogger.Debug("using Git without authentication")
	}

	if err != nil {
		return nil, fmt.Errorf("failed to build git client: %w", err)
	}

	return &Service{
		Cfg:    cfg,
		auth:   auth,
		logger: childLogger,

		filesByName:        make(map[string]filesystem.File),
		OnFilesUpdatedHook: onFilesUpdatedHook,
	}, nil
}

// Start all configured git syncs. Initially trigger them once and return an error if there are issues.
func (c *Service) Start() error {
	if !c.Cfg.Enabled {
		return nil
	}

	err := c.CloneRepository(context.Background())
	if err != nil {
		return fmt.Errorf("failed to clone git repo: %w", err)
	}

	// Start background sync task
	go c.SyncRepo()

	return nil
}

// CloneRepository clones the git repository
func (c *Service) CloneRepository(ctx context.Context) error {
	fs := memfs.New()
	c.memFs = fs

	// 1. Clone repository
	var referenceName plumbing.ReferenceName
	if c.Cfg.Repository.Branch != "" {
		referenceName = plumbing.NewBranchReferenceName(c.Cfg.Repository.Branch)
	}
	c.logger.Info("cloning git repository", zap.String("url", c.Cfg.Repository.URL))
	repo, err := git.CloneContext(ctx, memory.NewStorage(), fs, &git.CloneOptions{
		URL:           c.Cfg.Repository.URL,
		Auth:          c.auth,
		ReferenceName: referenceName,
	})
	if err != nil {
		return err
	}
	c.repo = repo

	// 2. Put files into cache
	empty := make(map[string]filesystem.File)
	files, err := c.readFiles(fs, empty, c.Cfg.Repository.BaseDirectory, 15)
	if err != nil {
		return fmt.Errorf("failed to get files: %w", err)
	}
	c.setFileContents(files)

	c.logger.Info("successfully cloned git repository",
		zap.String("base_directory", c.Cfg.Repository.BaseDirectory), zap.Int("read_files", len(files)))

	if c.OnFilesUpdatedHook != nil {
		c.OnFilesUpdatedHook()
	}

	return nil
}

// SyncRepo periodically pulls the repository contents to ensure it's always up to date. When changes appear
// the file cache will be updated. This function will periodically pull the repository until the passed context
// is done.
func (c *Service) SyncRepo() {
	if c.Cfg.RefreshInterval == 0 {
		c.logger.Info("refresh interval for sync is set to 0 (disabled)")
		return
	}

	tree, err := c.repo.Worktree()
	if err != nil {
		c.logger.Error("failed to get work tree from repository. stopping git sync", zap.Error(err))
		return
	}

	// Stop sync when we receive a signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(c.Cfg.RefreshInterval)
	for {
		select {
		case <-quit:
			c.logger.Info("stopped sync", zap.String("reason", "received signal"))
			return
		case <-ticker.C:
			var referenceName plumbing.ReferenceName
			if c.Cfg.Repository.Branch != "" {
				referenceName = plumbing.NewBranchReferenceName(c.Cfg.Repository.Branch)
			}
			err := tree.Pull(&git.PullOptions{Auth: c.auth, ReferenceName: referenceName})
			if err != nil {
				if err == git.NoErrAlreadyUpToDate {
					continue
				}
				c.logger.Error("pulling the repo has failed", zap.Error(err))
				continue
			}

			// Update cache with new markdowns
			empty := make(map[string]filesystem.File)
			files, err := c.readFiles(c.memFs, empty, c.Cfg.Repository.BaseDirectory, 5)
			if err != nil {
				c.logger.Error("failed to read files after pulling", zap.Error(err))
				continue
			}
			c.setFileContents(files)
			c.logger.Info("successfully pulled git repository",
				zap.Int("read_files", len(files)))

			if c.OnFilesUpdatedHook != nil {
				c.OnFilesUpdatedHook()
			}
		}
	}
}

// setFileContents saves file contents into memory, so that they are accessible at any time.
// filesByName is a map where the key is the filename without extension suffix (e.g. "README" instead of "README.md")
func (c *Service) setFileContents(filesByName map[string]filesystem.File) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.filesByName = filesByName
}

// GetFileByFilename returns the cached content for a given filename (without extension).
// The parameter must match the filename in the git repository (case sensitive).
// If there's no match nil will be returned.
func (c *Service) GetFileByFilename(fileName string) filesystem.File {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	contents, exists := c.filesByName[fileName]
	if !exists {
		return filesystem.File{}
	}

	return contents
}

// GetFilesByFilename returns the cached content in a map where the filename is the key (with trimmed file extension).
func (c *Service) GetFilesByFilename() map[string]filesystem.File {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	return c.filesByName
}

func buildBasicAuth(cfg config.GitAuthBasicAuth) transport.AuthMethod {
	return &http.BasicAuth{
		Username: cfg.Username,
		Password: cfg.Password,
	}
}

func buildSshAuth(cfg config.GitAuthSSH) (transport.AuthMethod, error) {
	if cfg.PrivateKeyFilePath != "" {
		_, err := os.Stat(cfg.PrivateKeyFilePath)
		if err != nil {
			return nil, fmt.Errorf("read file %s failed %s\n", cfg.PrivateKeyFilePath, err.Error())
		}

		auth, err := ssh.NewPublicKeysFromFile("git", cfg.PrivateKeyFilePath, cfg.Passphrase)
		if err != nil {
			return nil, err
		}
		return auth, nil
	}

	if cfg.PrivateKey != "" {
		auth, err := ssh.NewPublicKeys("git", []byte(cfg.PrivateKey), cfg.Passphrase)
		if err != nil {
			return nil, err
		}
		return auth, nil
	}

	return nil, fmt.Errorf("no ssh private key configured")
}
