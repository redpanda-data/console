function getBuildTimeUtc(): string {
  const buildTimestampEnv = process.env.REACT_APP_BUILD_TIMESTAMP;
  if (!buildTimestampEnv) return 'env not set';
  try {
    return new Date(Number(buildTimestampEnv) * 1000).toUTCString();
  } catch (e) {
    return `cannot convert timestamp to utc: ${String(e)}`;
  }
}

export default getBuildTimeUtc;
