import { fork, ChildProcess } from 'child_process';
import merge from 'lodash/merge';
import minimist from 'minimist';
import os from 'os';
import colors from 'colors';

import * as reportTheme from './reportTheme';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

import {
  JobArgs,
  JobResult,
  JobArgsDetails,
  JobChildCode,
  JobParentCode,
  JobLog,
  ForkArgs,
  ForkOptions,
  JobStatus,
  JobOptions,
} from './job.types';
import dayjs from 'dayjs';

class SimpleJob {
  /** simplelogs report id */
  reportId?: string;

  maintainer?: string;
  description?: string;
  scriptName: string;
  scriptPath: string;
  env = process.env.NODE_ENV;

  categories?: string[];
  args: JobArgs;
  parentId?: string;
  status: JobStatus = JobStatus.PENDING;

  /** Children */
  children: { [pid: number]: ChildProcess } = {};
  childrenCount = 0;
  confirmMessage = 'Type --confirm to perform more.';

  // Data.
  result: JobResult = {};
  logs: JobLog[] = [];
  private _alreadySentLogsIds: { [key: string]: true | undefined } = {};

  // Simplelogs.
  simplelogsToken?: string;
  simplelogsUrl? = 'http://localhost:5101';

  // Timers.
  startedAt?: string;
  startedAtTimestamp?: number;
  endedAt?: string;
  endedAtTimestamp?: number;

  // Reports.
  get report(): string {
    return this._generateReport();
  }
  get coloredReport(): string {
    return this._generateColoredReport();
  }

  tags: string[] = [];
  thread?: string;

  /** Arguments of getArgs call stored for usage print. */
  private _argsDetails: JobArgsDetails = {
    params: {},
    namedParams: {},
  };

  /** Max errors to show in report. */
  reportErrorsLimit = 6;

  itemsOffset = 0;
  disableReport?: boolean;
  disableConnect?: boolean;

  private _interval?: NodeJS.Timer;

  // Functions.
  onCrash?: (error: any) => Promise<any>;
  onDone?: () => Promise<any>;

  // Other.
  timeFormat = 'hh:mm:ss';

  constructor({
    maintainer,
    description,
    fileName,
    confirmMessage,
    disableReport,
    disableConnect,
    onDone,
    onCrash,
    tags,
    thread,
  }: JobOptions) {
    this.maintainer = maintainer || this.maintainer;
    this.description = description || this.description;
    this.scriptName = fileName.split('/').reverse()[0].split('.')[0];
    this.scriptPath = fileName;
    this.disableReport = disableReport || this.disableReport;
    this.disableConnect = disableConnect || this.disableConnect;
    this.confirmMessage = confirmMessage || this.confirmMessage;
    this.onCrash = onCrash || this.onCrash;
    this.onDone = onDone || this.onDone;
    if (tags) {
      this.tags = [...this.tags, ...tags];
    }
    this.thread = thread;
    this.args = {};
  }

  createId() {
    return uuidv4();
  }

  /** Called when exit is unhandled, crash or manual exit */
  async unHandledExit(message: string, status: JobStatus = JobStatus.EXIT) {
    if (message) {
      this.addError(message);
    }
    this.status = status;
    this.endedAt = dayjs().toString();
    this.endedAtTimestamp = Date.now();
    await this.simplelogsUpdate(true);
    console.error(this.coloredReport);
    process.exit(1);
  }

  /** On unhandled exit, print report anyway. */
  loadExitLog() {
    // CTRL+C
    process.on('SIGINT', async () => {
      await this.unHandledExit('CTRL+C exit triggered');
    });
    // Keyboard quit
    process.on('SIGQUIT', async () => {
      await this.unHandledExit('Keyboard quit triggered');
    });
    // `kill` command
    process.on('SIGTERM', async () => {
      await this.unHandledExit('Kill command triggered');
    });
  }

  getErrors(): JobLog[] {
    return this.logs.filter((log) => log.type === 'error') as JobLog[];
  }

  /** Export csv data in a file */
  async exportCsv(path: string, data: { [key: string]: string | number }[]) {
    if (data.length === 0) {
      this.addError(`No data to export in ${path}`);
    }
    const dir = path.split('/').slice(0, -1).join('/');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const headers = data[0] ? Object.keys(data[0]) : [];
      const fileStream = fs.createWriteStream(path);
      fileStream.on('error', (error: any) => reject(error)).on('close', () => resolve(undefined));

      fileStream.write(headers.join(',') + '\n');
      data.forEach((dataUnit) => {
        const values = Object.values(dataUnit).map((value) =>
          typeof value === 'string' && value.includes(',') ? `"${value}"` : value
        );
        const line = values.join(',') + '\n';
        fileStream.write(line);
      });
      fileStream.close();
    });
  }

  async simplelogsStart() {
    if (this.simplelogsToken) {
      try {
        const response = await fetch(`${this.simplelogsUrl}/report`, {
          method: 'POST',
          body: JSON.stringify({
            name: this.scriptName,
            path: this.scriptPath,
            args: this.args,
            tags: this.tags,
            thread: this.thread,

            env: this.env,
            status: this.status,

            startedAt: this.startedAt,
            logs: this.logs,
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.simplelogsToken,
          },
        });
        const report = await response.json();

        this.reportId = report._id;
        this._interval = setInterval(async () => await this.simplelogsUpdate(), 2000);
      } catch (error: any) {
        this.addError(`Failed to send report (at start) to simplelogs api`, error.response);
      }
    }
  }

  async simplelogsUpdate(lastUpdate = false) {
    if (this.simplelogsToken && this.reportId) {
      const logsToSend = this.logs.filter((log) => !this._alreadySentLogsIds[log.id]);
      try {
        await fetch(`${this.simplelogsUrl}/report/${this.reportId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            logs: logsToSend,
            status: this.status,
            endedAt: this.endedAt,
            result: this.result,
            report: this.report,
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.simplelogsToken,
          },
        });
        logsToSend.forEach((log) => {
          this._alreadySentLogsIds[log.id] = true;
        });
      } catch (error: any) {
        this.addError(`Failed to send report (at update) to simplelogs api`, error.response);
      }
      if (lastUpdate) {
        clearInterval(this._interval);
      }
    }
  }

  async connect(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    return;
  }

  /**
   * Print usage of the job based on args and scriptName.
   * @param exit Exit the job after print if true.
   */
  printUsage = (exit = true) => {
    let usage = `Usage: node ${this.scriptName}`;
    if (Object.keys(this._argsDetails.params).length) {
      Object.entries(this._argsDetails.params).forEach(([paramKey, schema]) => {
        const required = schema._flags.presence === 'required';
        if (required) {
          usage += ` <${paramKey}>`;
        } else {
          usage += ` [${paramKey}]`;
        }
      });
    }
    if (Object.keys(this._argsDetails.namedParams).length) {
      Object.entries(this._argsDetails.namedParams).forEach(([paramKey, schema]) => {
        const required = schema._flags.presence === 'required';
        if (required) {
          usage += ` <--${paramKey}>`;
        } else {
          usage += ` [--${paramKey}]`;
        }
      });
    }
    console.info(usage);
    if (exit) {
      process.exit(1);
    }
  };

  /**
   * Add a result or update its count to the job and its report.
   * @param key Key of the result.
   * @param count Count to add to the result, default 1.
   */
  addResult = (key: string, value: number | string | string[] | number[] | object = 1) => {
    if (Array.isArray(value)) {
      if (this.result[key]) {
        this.result[key].push(...value);
      } else {
        this.result[key] = value;
      }
    } else if (typeof value === 'string') {
      this.result[key] = value;
    } else if (typeof value === 'number') {
      if (this.result[key]) {
        this.result[key] += value;
      } else {
        this.result[key] = value;
      }
    } else {
      console.error(`Result "${key}" not yet handled.`);
    }
  };

  /**
   * Add any error to the job errors list.
   * @param message the error string message.
   * @param data the data linked to the error.
   */
  addError = (text: string, data?: any) => {
    const error: JobLog = {
      id: this.createId(),
      type: 'error',
      date: new Date().toISOString(),
      message: text,
      data,
    };
    console.error(`[${dayjs(error.date).format(this.timeFormat)}] ${error.message}`);
    this.logs.push(error);
  };
  error = this.addError;

  addLog = (text: string, data?: any) => {
    const log: JobLog = {
      id: this.createId(),
      type: 'log',
      date: new Date().toISOString(),
      message: text,
      data,
    };
    console.log(`[${dayjs(log.date).format(this.timeFormat)}] ${log.message}`);
    this.logs.push(log);
  };

  removeColors(string: string) {
    return string.replace(/\u001b\[[0-9]+m/g, '');
  }

  printProgression = ({ processed = 0, total = 0, optionalPrefix = '' }) => {
    const percentage = ((processed / total) * 100).toFixed(2);
    const durationSeconds = Date.now() - this.startedAtTimestamp!;
    const prefix = optionalPrefix ? `[${optionalPrefix}]` : '';
    console.info(`${prefix}[${percentage}%] ${processed} / ${total} in ${durationSeconds}s`);
  };

  /**
   * Called at the end of the job if its ran successfully.
   */
  private _generateColoredReport = () => {
    let report = '';
    // Regular report.
    report = `${reportTheme.separator(undefined, 'Job report')}\n`;
    report += `👷 Job > ${reportTheme.scriptName(this.scriptName)}\n`;
    report += `📁 Path > ${this.scriptPath}\n`;
    if (this.env) report += `💻 Env > ${this.env}\n`;
    report += `🚦 Status > ${reportTheme.status(this.status)}\n`;

    const durationSeconds = (this.endedAtTimestamp! - +this.startedAtTimestamp!) / 1000;
    report += `⏰ Duration > ${reportTheme.duration(durationSeconds)}\n`;

    // Children.
    if (this.childrenCount > 0) {
      report += `🤰 Children > ${this.childrenCount}\n`;
    }

    // Args.
    const argsEntries = Object.entries(this.args).filter(([, value]) => value !== undefined);
    if (argsEntries.length) {
      report += `💬 Args >\n`;
      report += argsEntries
        .map(([key, value]) => `\t- ${key}: ${reportTheme.value(value)}`)
        .join('\n');
      report += '\n';
    }

    // Results.
    if (Object.keys(this.result).length > 0) {
      report += `📊 Results >\n`;
      report += Object.entries(this.result)
        .map(([key, value]) => `\t- ${key}: ${reportTheme.value(value)}`)
        .join('\n');
      report += '\n';
    }

    // Errors.
    const errors = this.getErrors();
    if (errors.length) {
      report += `🚩 Errors >\n`;
      report += errors
        .slice(0, this.reportErrorsLimit)
        .sort()
        .map((error) => `\t- ${colors.red(error.message.split('\n')[0])}`)
        .join('\n');
      if (this.logs.filter((x) => x.type === 'error').length - this.reportErrorsLimit > 0) {
        report += `\n\t${colors.red(
          `(...${
            this.logs.filter((x) => x.type === 'error').length - this.reportErrorsLimit
          } more errors)`
        )}`;
      }
      report += '\n';
    }

    report += reportTheme.separator();
    // Handle confirm param.
    if (this._argsDetails.namedParams.confirm && !this.args.confirm) {
      report += reportTheme.confirmMessage(this.confirmMessage);
    }

    return report;
  };

  private _generateReport = () => {
    const coloredReport = this._generateColoredReport();
    return this.removeColors(coloredReport);
  };

  /**
   * Get args from argv, check schemas and set args to the job instance.
   * Used for the report and the usage.
   * @param params an object { paramKey: joiSchema }
   * @param namedParams an object { paramKey: joiSchema }
   * @returns object of all params { key: value }
   */
  getArgs = <T = any>(
    params: JobArgsDetails['params'] = {},
    namedParams: JobArgsDetails['namedParams'] = {}
  ): T => {
    // TODO `params` doit etre un tableau pour etre sur de respecter l'ordre
    const argv = minimist(process.argv.slice(2));
    this._argsDetails = {
      params,
      namedParams,
    };
    const args: JobArgs = {};
    Object.entries(params).forEach(([paramKey, schema], i) => {
      args[paramKey] = argv._[i];
      // Set default.
      if (!args[paramKey] && schema._flags.default) {
        args[paramKey] = schema._flags.default;
      }
      const validationResult = schema.validate(args[paramKey]);
      if (validationResult.error) {
        console.error(
          validationResult.error.details[0].message.replace('"value"', `"${paramKey}"`)
        );
        this.printUsage();
      }
      args[paramKey] = validationResult.value;
    });
    Object.entries(namedParams).forEach(([paramKey, schema]) => {
      args[paramKey] = argv[paramKey];
      // Set default.
      if (!args[paramKey] && schema._flags.default) {
        args[paramKey] = schema._flags.default;
      }
      const validationResult = schema.validate(args[paramKey]);
      if (validationResult.error) {
        console.error(
          validationResult.error.details[0].message.replace('"value"', `"${paramKey}"`)
        );
        this.printUsage();
      }
      args[paramKey] = validationResult.value;
    });
    Object.assign(this.args, args);
    return this.args;
  };

  /**
   * Wrap the job execution between database connection, globalConfig init and slack notifications.
   * @param  processJob an async function that will be called to process the job
   */
  start = async (processJob: () => Promise<any>) => {
    try {
      if (!this.disableConnect) {
        await this.connect();
      }
      this.loadExitLog();
      this.startedAt = dayjs().toISOString();
      this.startedAtTimestamp = dayjs(this.startedAt).valueOf();
      this.status = JobStatus.RUNNING;
      this.addLog('🚀 Job started...');
      await this.simplelogsStart();

      // Process job.
      await processJob();

      this.endedAt = dayjs().toISOString();
      this.endedAtTimestamp = dayjs(this.endedAt).valueOf();
      this.status = this.getErrors().length ? JobStatus.WARNING : JobStatus.SUCCESS;

      this.addLog('✅ Job done.');
      if (this.onDone) await this.onDone();

      if (!this.disableReport) {
        console.log(this.coloredReport);
      }

      if (!this.disableConnect) {
        await this.disconnect();
      }

      if (this.simplelogsToken) {
        await this.simplelogsUpdate(true);
      }

      process.exit(0);
    } catch (error: any) {
      await this.unHandledExit(error.stack, JobStatus.CRASH);
      this.status = JobStatus.CRASH;
      this.addLog('💥 Job crashed.');
      console.log(this.coloredReport);
      if (this.onCrash) await this.onCrash(error);
      if (!this.disableConnect) {
        await this.disconnect();
      }
      process.exit(1);
    }
  };

  startChild = (processChildJob: (initData: any, itemToProcess: any) => any) =>
    this.start(
      () =>
        new Promise((resolve) => {
          try {
            this.initChildMessageHandler(processChildJob, resolve);
            (process as any).send({ code: JobChildCode.READY });
          } catch (error: any) {
            (process as any).send({ code: JobChildCode.ERROR, error: error.toString() });
          }
        })
    );

  exit = async (exitCode: any) => {
    await this.disconnect();
    process.exit(exitCode);
  };

  initChildMessageHandler = (
    processChildJob: (initData: any, itemToProcess: any) => any,
    resolve: (value: unknown) => any
  ) => {
    let initData: any = {};

    process.on(
      'message',
      async (message: { code: JobParentCode; initData?: any; itemsToProcess?: any[] }) => {
        this.resetStatsObject();

        try {
          switch (message.code) {
            case JobParentCode.INIT:
              initData = message.initData || {};
              break;
            case JobParentCode.PROCESS: {
              const { itemsToProcess } = message;
              if (!itemsToProcess || !itemsToProcess.length) {
                await (process as any).send({ code: JobChildCode.FINISHED });
                resolve(undefined);
                return this.exit(0);
              }

              const data: any = await processChildJob(initData, itemsToProcess);
              (process as any).send({
                code: JobChildCode.DONE,
                ...this.createStatsObject(),
                data,
              });
              break;
            }
            case JobParentCode.EXIT:
              resolve(undefined);
              await this.exit(0);
              break;
            default:
              break;
          }
        } catch (error: any) {
          console.error(error);
          this.addError(`[${__filename}] Error`, error);
          (process as any).send({ code: JobChildCode.ERROR, ...this.createStatsObject() });
        }
      }
    );
  };

  forkOneChild = ({
    childPath,
    forkOptions = {},
    itemsToProcess,
    initData = {},
    batchSize = 1,
    onError,
    onFinished,
    onIteration,
    onChildReturn,
  }: ForkArgs) =>
    new Promise((resolve, reject) => {
      const defaultForkOptions: ForkOptions = {
        args: [],
        detached: true, // Prepare child to run independently of its parent process
        childUnref: true, // Prevent the parent from waiting for a given subprocess to exit
      };
      forkOptions = merge(defaultForkOptions, forkOptions);

      const childProcess = fork(childPath, forkOptions.args || [], {
        detached: forkOptions.detached,
      });
      this.children[childProcess.pid!] = childProcess;
      this.childrenCount += 1;

      if (forkOptions.childUnref) {
        childProcess.unref();
      }

      childProcess.on(
        'message',
        async (message: { code: JobChildCode; result: JobResult; logs: JobLog[]; data: any }) => {
          if (message.code === JobChildCode.READY) {
            childProcess.send({
              code: JobParentCode.INIT,
              initData,
            });
          }

          if (message.code === JobChildCode.ERROR) {
            if (onError) {
              await onError(message);
            }
          }

          if ([JobChildCode.READY, JobChildCode.DONE, JobChildCode.ERROR].includes(message.code)) {
            this.addStatsFromChild(message);

            if (onIteration?.fn) {
              if (this.itemsOffset % (onIteration.everyNth || 1) === 0) {
                await onIteration.fn(message);
              }
            }

            const items = itemsToProcess.slice(this.itemsOffset, this.itemsOffset + batchSize!);
            childProcess.send({ code: JobParentCode.PROCESS, itemsToProcess: items });
            this.itemsOffset += items.length;
          }

          if (message.code === JobChildCode.DONE) {
            if (onChildReturn) {
              onChildReturn(message.data, message);
            }
          }

          if (message.code === JobChildCode.FINISHED) {
            delete this.children[childProcess.pid!];
            if (Object.keys(this.children).length === 0) {
              if (onFinished) {
                await onFinished(message);
              }
              resolve(undefined);
            }
          }
        }
      );

      childProcess.on('error', (error: any) => {
        return reject(error);
      });

      childProcess.on('exit', (code: number) => {
        if (code) {
          return reject(code);
        }
        return resolve(undefined);
      });
    });

  forkChildren = async ({ forkOptions = {}, itemsToProcess, ...rest }: ForkArgs) => {
    const childrenNumber =
      forkOptions.childrenNumber || Math.min(os.cpus().length, itemsToProcess.length);
    return Promise.all(
      Array(childrenNumber)
        .fill(0)
        .map(() => this.forkOneChild({ forkOptions, itemsToProcess, ...rest }))
    );
  };

  /** Merges 2 results */
  mergeResult = (result: JobResult, newResult: JobResult) => {
    Object.keys(newResult).forEach((key) => {
      if (!result[key]) {
        result[key] = newResult[key];
      } else if (newResult[key] && typeof newResult[key] === 'number') {
        result[key] += newResult[key];
      } else if (Array.isArray(newResult[key])) {
        result[key].push(...newResult[key]);
      } else if (newResult[key] && typeof newResult[key] === 'object') {
        result[key] = this.mergeResult(result[key], newResult[key]);
      } else if (!newResult[key]) {
        result[key] = newResult;
      }
    });
    return result;
  };

  addStatsFromChild = ({ result, logs }: { result: JobResult; logs: JobLog[] }) => {
    if (result) {
      this.mergeResult(this.result, result);
    }
    if (logs) {
      this.logs.push(...logs);
    }
  };

  createStatsObject = () => ({
    result: this.result,
    logs: this.logs,
  });

  resetStatsObject = () => {
    this.result = {};
    this.logs = [];
  };
}

export default SimpleJob;
