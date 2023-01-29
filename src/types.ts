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

export type JobLog = {
  id: string;
  date: string;
  message: string;
  type: 'error' | 'log';
  data?: string;
};

export type JobOptions = {
  maintainer?: string;
  filename: string;
  childPath?: string;
  categories?: string[];
  disableReport?: boolean;
  confirmMessage?: string;
  disableConnect?: boolean;
  description?: string;
  tags?: string[];
  thread?: string;

  onEnd?: (status: JobStatus, error?: any) => Promise<any>;
};
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  WARNING = 'warning',
  CRASH = 'crash',
  EXIT = 'exit',
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
