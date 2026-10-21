import { e2eConfig } from '../shared/rstest-config';

export default e2eConfig('console-enterprise', { workers: 4, retries: 2, timeout: 120_000 });
