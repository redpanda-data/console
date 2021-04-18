package filesystem

// Config for Filesystem service
type Config struct {
	Enabled bool `yaml:"enabled"`

	// AllowedFileExtensions specifies file extensions that shall be picked up. If at least one is specified all other
	// file extensions will be ignored.
	AllowedFileExtensions []string `yaml:"-"`

	// Max file size which will be considered. Files exceeding this size will be ignored and logged.
	MaxFileSize int64 `yaml:"-"`

	// Whether or not to use the filename or the full filepath as key in the map
	IndexByFullFilepath bool `yaml:"-"`

	// Paths whose files shall be watched. Subdirectories and their files will be included.
	Paths []string `yaml:"paths"`
}

// Validate all root and child config structs
func (c *Config) Validate() error {
	if !c.Enabled {
		return nil
	}

	return nil
}

// SetDefaults for all root and child config structs
func (c *Config) SetDefaults() {
	c.MaxFileSize = 500 * 1000 // 500KB
	c.IndexByFullFilepath = false
}
