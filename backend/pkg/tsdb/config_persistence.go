package tsdb

import (
	"fmt"
	"time"
)

type PersistenceConfig struct {
	Enabled bool                  `yaml:"enabled"`
	Disk    PersistenceDiskConfig `yaml:"disk"`
}

func (c *PersistenceConfig) SetDefaults() {
	c.Enabled = false
	c.Disk.SetDefaults()
}

func (c *PersistenceConfig) Validate() error {
	if !c.Enabled {
		return nil
	}

	if !c.Disk.Enabled {
		return fmt.Errorf("TSDB persistence is enabled but Disk persistence is not enabled")
	}

	err := c.Disk.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate disk config: %w", err)
	}

	return nil
}

type PersistenceDiskConfig struct {
	Enabled   bool          `yaml:"enabled"`
	DataPath  string        `yaml:"dataPath"`
	Retention time.Duration `yaml:"retention"`
}

func (c *PersistenceDiskConfig) SetDefaults() {
	c.Enabled = false
	day := 24 * time.Hour
	c.Retention = 7 * day
}

func (c *PersistenceDiskConfig) Validate() error {
	if !c.Enabled {
		return nil
	}

	if c.DataPath == "" {
		return fmt.Errorf("disk config is enabled but no dataPath is configured")
	}

	return nil
}
