export type SimplejobArgs = any;

export type SimplejobArgSchema = {
  name: string;
  aliases?: `-${string}`[];
  validate?: (value: any) => boolean | string | undefined;
  default?: any;
  optional?: boolean;
};

export type SimplejobResult = {
  [key: string]: any;
};

export type SimplejobLog = {
  id: string;
  date: string;
  message: string;
  type: 'error' | 'log';
  data?: string;
};

export type SimplejobOptions = {
  maintainer?: string;
  __filename: string;
  childPath?: string;
  categories?: string[];
  disableReport?: boolean;
  confirmMessage?: string;
  disableConnect?: boolean;
  description?: string;
  tags?: string[];
  thread?: string;

  onEnd?: (status: SimplejobStatus, error?: any) => Promise<any>;
};
export enum SimplejobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  WARNING = 'warning',
  CRASH = 'crash',
  EXIT = 'exit',
}
