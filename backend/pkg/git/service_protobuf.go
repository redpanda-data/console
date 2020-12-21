package git

import (
	"context"
	"fmt"
	"github.com/go-git/go-billy/v5/memfs"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/storage/memory"
	"go.uber.org/zap"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// CloneProtos clones the git repository which contains the proto files.
func (c *Service) CloneProtos(ctx context.Context) error {
	fs := memfs.New()
	c.protoFs = fs

	// 1. Clone repository
	var referenceName plumbing.ReferenceName
	if c.Cfg.ProtobufRepo.Branch != "" {
		referenceName = plumbing.NewBranchReferenceName(c.Cfg.ProtobufRepo.Branch)
	}
	c.logger.Info("cloning git repository for proto files", zap.String("url", c.Cfg.ProtobufRepo.URL))
	repo, err := git.CloneContext(ctx, memory.NewStorage(), fs, &git.CloneOptions{
		URL:           c.Cfg.ProtobufRepo.URL,
		Auth:          c.auth,
		ReferenceName: referenceName,
	})
	if err != nil {
		return err
	}
	c.protoRepo = repo

	// 2. Put proto files into cache
	empty := make(map[string][]byte)
	protos, err := c.readFiles(fs, empty, ".", 5)
	if err != nil {
		return fmt.Errorf("failed to get protos: %w", err)
	}
	c.setProtos(protos)

	c.logger.Info("successfully cloned git repository for proto files",
		zap.Int("read_proto_files", len(protos)))

	return nil
}

// SyncProtos periodically pulls the repository contents to ensure it's always up to date. When changes appear
// the protos cache will be updated. This function will periodically pull the repository until the passed context
// is done.
func (c *Service) SyncProtos() {
	if c.Cfg.ProtobufRepo.RefreshInterval == 0 {
		c.logger.Info("refresh interval for protos sync is set to 0 (disabled)")
		return
	}

	tree, err := c.protoRepo.Worktree()
	if err != nil {
		c.logger.Error("failed to get work tree from protos repository. stopping git sync", zap.Error(err))
		return
	}

	// Stop sync when we receive a signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(c.Cfg.ProtobufRepo.RefreshInterval)
	for {
		select {
		case <-quit:
			c.logger.Info("stopped protos sync", zap.String("reason", "received signal"))
			return
		case <-ticker.C:
			err := tree.Pull(&git.PullOptions{Auth: c.auth})
			if err != nil {
				if err == git.NoErrAlreadyUpToDate {
					continue
				}
				c.logger.Error("pulling the protos repo has failed", zap.Error(err))
				continue
			}

			// Update cache with new markdowns
			empty := make(map[string][]byte)
			protos, err := c.readFiles(c.protoFs, empty, ".", 5)
			if err != nil {
				c.logger.Error("failed to get protos after pulling", zap.Error(err))
				continue
			}
			c.setProtos(protos)
			c.logger.Info("successfully pulled git repository for protos",
				zap.Int("read_proto_files", len(protos)))
		}
	}
}

func (c *Service) setProtos(protos map[string][]byte) {
	c.protosLock.Lock()
	defer c.protosLock.Unlock()

	c.protosByName = protos
}

// GetProtos returns a copy of all cached proto files that have been cloned.
// The returned map uses the filename without the '.proto' suffix as key.
func (c *Service) GetProtos() map[string][]byte {
	c.protosLock.RLock()
	defer c.protosLock.RUnlock()

	copiedMap := make(map[string][]byte, len(c.protosByName))
	for key, contents := range c.protosByName {
		copiedMap[key] = contents
	}

	return copiedMap
}
