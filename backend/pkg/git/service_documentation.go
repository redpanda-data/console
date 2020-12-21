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

// CloneDocumentation clones the git repository which contains the topic documentation
func (c *Service) CloneDocumentation(ctx context.Context) error {
	fs := memfs.New()
	c.docuFs = fs

	// 1. Clone repository
	var referenceName plumbing.ReferenceName
	if c.Cfg.TopicDocumentationRepo.Branch != "" {
		referenceName = plumbing.NewBranchReferenceName(c.Cfg.TopicDocumentationRepo.Branch)
	}
	c.logger.Info("cloning git repository for topic documentation", zap.String("url", c.Cfg.TopicDocumentationRepo.URL))
	repo, err := git.CloneContext(ctx, memory.NewStorage(), fs, &git.CloneOptions{
		URL:           c.Cfg.TopicDocumentationRepo.URL,
		Auth:          c.auth,
		ReferenceName: referenceName,
	})
	if err != nil {
		return err
	}
	c.docuRepo = repo

	// 2. Put markdowns into cache
	empty := make(map[string][]byte)
	markdowns, err := c.readFiles(fs, empty, ".", 5)
	if err != nil {
		return fmt.Errorf("failed to get markdowns: %w", err)
	}
	c.setDocumentations(markdowns)

	c.logger.Info("successfully cloned git repository for topic documentation",
		zap.Int("read_markdown_files", len(markdowns)))

	return nil
}

// SyncDocumentation periodically pulls the repository contents to ensure it's always up to date. When changes appear
// the documentation cache will be updated. This function will periodically pull the repository until the passed context
// is done.
func (c *Service) SyncDocumentation() {
	if c.Cfg.TopicDocumentationRepo.RefreshInterval == 0 {
		c.logger.Info("refresh interval for topic documentation sync is set to 0 (disabled)")
		return
	}

	tree, err := c.docuRepo.Worktree()
	if err != nil {
		c.logger.Error("failed to get work tree from documentation repository. stopping git sync", zap.Error(err))
		return
	}

	// Stop sync when we receive a signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(c.Cfg.TopicDocumentationRepo.RefreshInterval)
	for {
		select {
		case <-quit:
			c.logger.Info("stopped topic documentation sync", zap.String("reason", "received signal"))
			return
		case <-ticker.C:
			err := tree.Pull(&git.PullOptions{Auth: c.auth})
			if err != nil {
				if err == git.NoErrAlreadyUpToDate {
					continue
				}
				c.logger.Error("pulling the topic documentation repo has failed", zap.Error(err))
				continue
			}

			// Update cache with new markdowns
			empty := make(map[string][]byte)
			markdowns, err := c.readFiles(c.docuFs, empty, ".", 5)
			if err != nil {
				c.logger.Error("failed to get documentation markdowns after pulling", zap.Error(err))
				continue
			}
			c.setDocumentations(markdowns)
			c.logger.Info("successfully pulled git repository for topic documentation",
				zap.Int("read_markdown_files", len(markdowns)))
		}
	}
}

func (c *Service) setDocumentations(markdowns map[string][]byte) {
	c.markdownsLock.Lock()
	defer c.markdownsLock.Unlock()

	c.markdownsByName = markdowns
}

// GetTopicDocumentation returns the cached markdown content for a given topicName.
// The topicName parameter must match the filename in the git repository (case sensitive).
// If there's no match, an empty string (empty byte array) will be returned.
func (c *Service) GetTopicDocumentation(topicName string) []byte {
	c.markdownsLock.RLock()
	defer c.markdownsLock.RUnlock()

	contents, exists := c.markdownsByName[topicName]
	if !exists {
		return []byte("")
	}

	return contents
}
