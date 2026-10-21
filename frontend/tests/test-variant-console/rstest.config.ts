import { e2eConfig } from '../shared/rstest-config';

export default e2eConfig('console', { workers: 8, retries: 2, timeout: 30_000 });
