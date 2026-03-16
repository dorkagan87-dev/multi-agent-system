import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: 'info',
  transport: config.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
