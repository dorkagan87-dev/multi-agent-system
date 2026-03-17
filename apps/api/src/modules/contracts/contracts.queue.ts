import { Queue } from 'bullmq';
import { redis } from '../../config/redis';

export interface ContractJobData {
  contractId: string;
}

export const contractQueue = new Queue<ContractJobData>('contract-analysis', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});
