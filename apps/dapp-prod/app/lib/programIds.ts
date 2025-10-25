import { runtimeEnv } from '../config/runtime';

export const PIDS = runtimeEnv.programIds[runtimeEnv.cluster] ?? {};
