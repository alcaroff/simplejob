import { fork, ChildProcess } from 'child_process';
import _ from 'lodash';
import minimist from 'minimist';
import os from 'os';

import * as reportTheme from './reportTheme';
import axios from 'axios';

import {
  JobArgs,
  JobResult,
  JobArgsDetails,
  JobChildCode,
  JobParentCode,
  JobError,
  JobLog,
  ForkArgs,
  ForkOptions,
  JobStatus,
} from './job.types';
import dayjs from 'dayjs';

class Job {
  reportId?: string;
  maintainer?: string;
  description?: string;
  scriptName: string;
  scriptPath: string;

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
  errors: JobError[] = [];
  logs: JobLog[] = [];

  // Simplelogs.
  simplelogsToken?: string;
  simplelogsUrl? = 'http://localhost:5101';

  // Timers.
  startedAt?: string;
  startedAtTimestamp?: number;
  endedAt?: string;
  endedAtTimestamp?: number;

  // Report.
  report?: string;
  coloredReport?: string;

  fatalError?: any;

  /** Arguments of getArgs call stored for usage print. */
  private _argsDetails: JobArgsDetails = {
    params: {},
    namedParams: {},
  };

  /** Max errors to show in report. */
  reportErrorsLimit = 10;

  itemsOffset = 0;
  disableReport?: boolean;
  disableConnect?: boolean;
  private _interval?: NodeJS.Timer;

  constructor({
    maintainer,
    description,
    fileName,
    categories,
    confirmMessage,
    disableReport,
    disableConnect,
  }: {
    maintainer?: string;
    fileName: string;
    childPath?: string;
    categories?: string[];
    disableReport?: boolean;
    confirmMessage?: string;
    disableConnect?: boolean;
    description?: string;
  }) {
    this.maintainer = maintainer;
    this.description = description;
    this.scriptName = fileName.split('/').reverse()[0].split('.')[0];
    this.scriptPath = fileName;
    this.categories = categories;
    this.disableReport = disableReport;
    this.disableConnect = disableConnect;
    if (confirmMessage) {
      this.confirmMessage = confirmMessage;
    }
    this.args = {};
  }

  async simplelogsStart() {
    if (this.simplelogsToken) {
      console.log(this.simplelogsToken);
      const { data } = await axios.post(
        `${this.simplelogsUrl}/report`,
        {
          name: this.scriptName,
          path: this.scriptPath,
          args: this.args,

          env: process.env.NODE_ENV,
          status: this.status,

          startedAt: this.startedAt,
          standardLogs: this.logs,
          errorLogs: this.errors,

          parent: this.parentId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.simplelogsToken}`,
          },
        }
      );
      this.reportId = data._id;
      this._interval = setInterval(async () => await this.simplelogsUpdate(), 5000);
    }
  }

  async simplelogsUpdate(lastUpdate = false) {
    if (this.simplelogsToken && this.reportId) {
      await axios.patch(
        `${this.simplelogsUrl}/report/${this.reportId}`,
        {
          startedAt: this.startedAt,
          reportLog: this.generateReport(),
          standardLogs: this.logs,
          errorLogs: this.errors,
          status: this.status,
        },
        {
          headers: {
            Authorization: `Bearer ${this.simplelogsToken}`,
          },
        }
      );
    }
    if (lastUpdate) {
      clearInterval(this._interval);
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
    const error = {
      date: new Date().toISOString(),
      text,
      data: data,
    };
    console.error(`[${dayjs(error.date).format('mm:hh:ss')}] ${error.text}`);
    this.errors.push(error);
  };

  addLog = (text: string) => {
    const log = {
      date: new Date().toISOString(),
      text,
    };
    console.error(`[${dayjs(log.date).format('mm:hh:ss')}] ${log.text}`);
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
  generateReport = () => {
    let report = '';
    // Regular report.
    report = `${reportTheme.separator(undefined, 'Job report')}\n`;
    report += `👷 ${reportTheme.title('Job')} => ${reportTheme.scriptName(this.scriptName)}\n`;
    report += `📁 ${reportTheme.title('Path')} => ${this.scriptPath}\n`;
    report += `⚙️ ${reportTheme.title('Status')} => ${reportTheme.status(this.status)}\n`;
    if (this.fatalError) {
      report += `💥 Fatal error => ${this.fatalError.message.stack}\n`;
    }

    const durationSeconds = (this.endedAtTimestamp! - +this.startedAtTimestamp!) / 1000;
    report += `⏰ ${reportTheme.title('Duration')} => ${reportTheme.duration(durationSeconds)}\n`;

    // Children.
    if (this.childrenCount > 0) {
      report += `🤰 ${reportTheme.title('Children')} => ${this.childrenCount}\n`;
    }

    // Args.
    const argsEntries = Object.entries(this.args).filter(([, value]) => value !== undefined);
    if (argsEntries.length) {
      report += `💬 ${reportTheme.title('Args')} =>\n`;
      report += argsEntries
        .map(([key, value]) => `\t${key}: ${reportTheme.argValue(value)}`)
        .join('\n');
      report += '\n';
    }

    // Results.
    if (Object.keys(this.result).length > 0) {
      report += `📊 ${reportTheme.title('Results')} =>\n`;
      report += Object.entries(this.result)
        .map(([key, value]) => `\t${key}: ${reportTheme.resultValue(value)}`)
        .join('\n');
      report += '\n';
    }

    // Errors.
    if (this.errors.length) {
      report += `🚩 ${reportTheme.title('Errors')} =>\n`;
      report += this.errors
        .slice(0, this.reportErrorsLimit)
        .sort()
        .map((error) => `\t${reportTheme.error(error.text)}`)
        .join('\n');
      if (this.errors.length - this.reportErrorsLimit > 0) {
        report += `\n\t${reportTheme.error(
          `(...${this.errors.length - this.reportErrorsLimit} more errors)`
        )}`;
      }
      report += '\n';
    }

    report += reportTheme.separator();
    // Handle confirm param.
    if (this._argsDetails.namedParams.confirm && !this.args.confirm) {
      report += reportTheme.confirmMessage(this.confirmMessage);
    }

    this.coloredReport = report;
    this.report = this.removeColors(report);

    return this.report;
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
      this.startedAt = dayjs().toISOString();
      this.startedAtTimestamp = dayjs(this.startedAt).valueOf();
      if (!this.disableConnect) {
        await this.connect();
      }
      await this.simplelogsStart();

      // Process job.
      this.status = JobStatus.RUNNING;
      await processJob();

      this.endedAt = dayjs().toISOString();
      this.endedAtTimestamp = dayjs(this.endedAt).valueOf();
      this.status = this.errors.length ? JobStatus.WARNING : JobStatus.SUCCESS;

      if (!this.disableReport) {
        this.generateReport();
        console.log(this.coloredReport);
      }

      if (!this.disableConnect) {
        await this.disconnect();
      }

      await this.simplelogsUpdate(true);
    } catch (error) {
      console.error(error);
      this.endedAt = dayjs().toISOString();
      this.endedAtTimestamp = dayjs(this.endedAt).valueOf();
      this.status = JobStatus.ERROR;
      await this.simplelogsUpdate(true);
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
      forkOptions = _.merge(defaultForkOptions, forkOptions);

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
        async (message: {
          code: JobChildCode;
          result: JobResult;
          errors: JobError[];
          logs: JobLog[];
          data: any;
        }) => {
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

  addStatsFromChild = ({
    result,
    errors,
    logs,
  }: {
    result: JobResult;
    errors: any[];
    logs: any[];
  }) => {
    if (result) {
      this.mergeResult(this.result, result);
    }
    if (errors) {
      this.errors.push(...errors);
    }
    if (logs) {
      this.logs.push(...logs);
    }
  };

  createStatsObject = () => ({
    result: this.result,
    errors: this.errors,
    logs: this.logs,
  });

  resetStatsObject = () => {
    this.result = {};
    this.errors = [];
    this.logs = [];
  };
}

export default Job;
