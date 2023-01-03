import type { Schema } from 'joi';

export type JobArgs = any;

export type JobArgsDetails = {
  params: {
    [key: string]: Schema;
  };
  namedParams: {
    [key: string]: Schema;
  };
};

export type JobResult = {
  [key: string]: any;
};

export type ForkOptions = {
  args?: JobArgs;
  detached?: boolean;
  childUnref?: boolean;
  childrenNumber?: number;
};

export type ForkArgs = {
  jobPath?: string;
  childPath: string;
  forkOptions?: ForkOptions;
  itemsToProcess: any[];
  initData?: { [k: string]: any };
  batchSize?: number;
  onIteration?: { fn: (message: any) => any; everyNth?: number };
  onFinished?: (message: any) => any;
  onError?: (message: any) => any;
  onChildReturn?: (data: any, message: any) => any;
};

export type JobError = { date: string; text: string; data?: any };
export type JobLog = { date: string; text: string };

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum JobParentCode {
  INIT = 'init',
  EXIT = 'exit',
  PROCESS = 'process',
}

export enum JobChildCode {
  READY = 'ready',
  ERROR = 'error',
  DONE = 'done',
  CUSTOM = 'custom',
  FINISHED = 'finished',
}

export type JobCode = JobParentCode | JobChildCode;
