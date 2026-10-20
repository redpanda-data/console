import { e2eConfig } from '../shared/rstest-config';

export default e2eConfig('kafka', { workers: 4, retries: 1, timeout: 30_000 });
