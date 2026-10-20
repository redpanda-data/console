import { e2eConfig } from '../shared/rstest-config';

export default e2eConfig('kafka-connect', { workers: 4, retries: 2, timeout: 30_000 });
