import { Queue } from 'bullmq';
import { redis } from '../../config/redis';

export interface TaskJobData {
  taskId: string;
}

export const taskQueue = new Queue<TaskJobData, any, string>('task-execution', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});
