import minimist from 'minimist';
import colors from 'colors';

import * as reportTheme from './reportTheme';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import dayjs from 'dayjs';
import axios from 'axios';

import {
  SimplejobArgs,
  SimplejobResult,
  SimplejobLog,
  SimplejobStatus,
  SimplejobOptions,
  SimplejobArgSchema,
} from './types';

export class Simplejob {
  /** simplelogs report id */
  reportId?: string;

  maintainer?: string;
  description?: string;
  scriptName: string;
  scriptPath: string;
  env = process.env.NODE_ENV;

  categories?: string[];
  args: SimplejobArgs;
  parentId?: string;
  status: SimplejobStatus = SimplejobStatus.PENDING;

  confirmMessage = 'Type --confirm to perform more.';

  // Data.
  result: SimplejobResult = {};
  logs: SimplejobLog[] = [];
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
  private _argSchemas: SimplejobArgSchema[] = [];

  /** Max errors to show in report. */
  reportErrorsLimit = 6;

  itemsOffset = 0;
  disableReport?: boolean;
  disableConnect?: boolean;

  private _interval?: NodeJS.Timer;

  // Functions.
  onEnd?: (status: SimplejobStatus, error?: any) => Promise<any>;

  // Other.
  timeFormat = 'hh:mm:ss';

  constructor({
    maintainer,
    description,
    __filename,
    confirmMessage,
    disableReport,
    disableConnect,
    onEnd,
    tags,
    thread,
  }: SimplejobOptions) {
    this.maintainer = maintainer || this.maintainer;
    this.description = description || this.description;
    this.scriptName = __filename.split('/').reverse()[0].split('.')[0];
    this.scriptPath = __filename;
    this.disableReport = disableReport || this.disableReport;
    this.disableConnect = disableConnect || this.disableConnect;
    this.confirmMessage = confirmMessage || this.confirmMessage;
    this.onEnd = onEnd || this.onEnd;
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
  unHandledExit = async (message: string, status: SimplejobStatus = SimplejobStatus.EXIT) => {
    if (message) {
      this.addError(message);
    }
    this.status = status;
    this.endedAt = dayjs().toString();
    this.endedAtTimestamp = Date.now();
    await this.simplelogsUpdate(true);
    console.error(this.coloredReport);
    process.exit(1);
  };

  /** On unhandled exit, print report anyway. */
  loadExitLog = () => {
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
  };

  getErrors = (): SimplejobLog[] => {
    return this.logs.filter((log) => log.type === 'error') as SimplejobLog[];
  };

  /** Export csv data in a file */
  exportCsv = (path: string, data: { [key: string]: string | number }[]) => {
    if (data.length === 0) {
      this.addError(`No data to export in ${path}`);
      return;
    }
    // this.addLog(`📀 Exporting ${data.length} lines to ${path}...`);
    const dir = path.split('/').slice(0, -1).join('/');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const headers = data[0] ? Object.keys(data[0]) : [];
      const fileStream = fs.createWriteStream(path);
      fileStream
        .on('error', (error: any) => reject(error))
        .on('close', () => {
          this.addLog(`📀 Exported ${data.length} lines to "${path}"`);
          resolve(undefined);
        });

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
  };

  simplelogsStart = async () => {
    if (this.simplelogsToken) {
      try {
        const { data: report } = await axios.post(
          `${this.simplelogsUrl}/report`,
          {
            name: this.scriptName,
            path: this.scriptPath,
            args: this.args,
            tags: this.tags,
            thread: this.thread,

            env: this.env,
            status: this.status,

            startedAt: this.startedAt,
            logs: this.logs,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: this.simplelogsToken,
            },
          }
        );

        this.logs.forEach((log) => {
          this._alreadySentLogsIds[log.id] = true;
        });
        this.reportId = report._id;
        this._interval = setInterval(async () => await this.simplelogsUpdate(), 2000);
      } catch (error: any) {
        this.addError(`Failed to send report (at start) to simplelogs api`);
        console.error(error);
      }
    }
  };

  simplelogsUpdate = async (lastUpdate = false) => {
    if (this.simplelogsToken && this.reportId) {
      const logsToSend = this.logs.filter((log) => !this._alreadySentLogsIds[log.id]);
      try {
        await axios.patch(
          `${this.simplelogsUrl}/report/${this.reportId}`,
          {
            logs: logsToSend,
            status: this.status,
            endedAt: this.endedAt,
            result: this.result,
            report: this.report,
            args: this.args,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: this.simplelogsToken,
            },
          }
        );
        logsToSend.forEach((log) => {
          this._alreadySentLogsIds[log.id] = true;
        });
      } catch (error: any) {
        this.addError(`Failed to send report (at update) to simplelogs api`, error.response);
        console.error(error);
      }
      if (lastUpdate) {
        clearInterval(this._interval);
      }
    }
  };

  connect = async (): Promise<void> => {
    return;
  };

  disconnect = async (): Promise<void> => {
    return;
  };

  /**
   * Print usage of the job based on args and scriptName.
   * @param exit Exit the job after print if true.
   */
  printUsage = (exit = true) => {
    let usage = `Usage: node ${this.scriptName}`;
    const namedArgs = this._argSchemas.filter((schema) => schema.name.startsWith('--'));
    const positionalArgs = this._argSchemas.filter((schema) => !schema.name.startsWith('--'));
    positionalArgs.forEach((schema) => {
      if (!schema.optional) {
        usage += ` <${schema.name}>`;
      } else {
        usage += ` [${schema.name}]`;
      }
    });
    namedArgs.forEach((schema) => {
      let usageNames = schema.name;
      schema.aliases?.forEach((alias) => {
        usageNames += `|${alias}`;
      });
      if (!schema.optional) {
        usage += ` <${usageNames}>`;
      } else {
        usage += ` [${usageNames}]`;
      }
    });
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
    const error: SimplejobLog = {
      id: this.createId(),
      type: 'error',
      date: new Date().toISOString(),
      message: text,
      data,
    };
    console.error(colors.red(`[${dayjs(error.date).format(this.timeFormat)}] ${error.message}`));
    this.logs.push(error);
  };
  error = this.addError;

  addLog = (text: string, data?: any) => {
    const log: SimplejobLog = {
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
    report = `${reportTheme.separator(undefined, 'Report')}\n`;
    report += `👷 Job > ${reportTheme.scriptName(this.scriptName)}\n`;
    report += `📁 Path > ${this.scriptPath}\n`;
    if (this.env) report += `💻 Env > ${this.env}\n`;
    report += `🚦 Status > ${reportTheme.status(this.status)}\n`;

    const durationSeconds = (this.endedAtTimestamp! - +this.startedAtTimestamp!) / 1000;
    report += `⏰ Duration > ${reportTheme.duration(durationSeconds)}\n`;

    // // Children.
    // if (this.childrenCount > 0) {
    //   report += `🤰 Children > ${this.childrenCount}\n`;
    // }

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

    return report;
  };

  private _generateReport = () => {
    const coloredReport = this._generateColoredReport();
    return this.removeColors(coloredReport);
  };

  /**
   * Get args from argv, check schemas and set args to the job instance.
   * Used for the report and the usage.
   * @param params an object { paramKey: simplejobArgSchema }
   * @param namedParams an object { paramKey: simplejobArgSchema }
   * @returns object of all params { key: value }
   */
  getArgs = <T = any>(argSchemas: SimplejobArgSchema[]): T => {
    // TODO `params` doit etre un tableau pour etre sur de respecter l'ordre
    const argv = minimist(process.argv.slice(2));
    this._argSchemas = argSchemas;
    const args: SimplejobArgs = {};
    let unnamedArgIndex = 0;
    argSchemas.forEach((schema) => {
      let key = schema.name;

      // Handle named params.
      if (schema.name.startsWith('--')) {
        key = schema.name.split('--')[1];
      }

      // Get value.
      let value = schema.name.startsWith('--') ? argv[key] : argv[++unnamedArgIndex];

      // Handle aliases.
      if (!value && schema.aliases && schema.aliases.length > 0) {
        schema.aliases.forEach((alias) => {
          const aliasKey = alias.split('-')[1];
          if (argv[aliasKey]) {
            value = argv[aliasKey];
          }
        });
      }

      // Set default.
      if (!value && schema.default) {
        value = schema.default;
      }

      // Handle required.
      if (!schema.optional && !value) {
        this.addError(`"${key}" is required`);
        this.printUsage();
      }

      // Handle validation.
      const validationResult = schema.validate?.(value);
      if (validationResult === false || typeof validationResult === 'string') {
        if (typeof validationResult === 'string')
          this.addError(`"${key}" is invalid: ${validationResult}`);
        else this.addError(`"${key}" is invalid`);
        this.printUsage();
      }

      if (value) args[key] = value;
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
      this.status = SimplejobStatus.RUNNING;
      console.log(`${reportTheme.separator(undefined, 'Logs')}`);
      this.addLog('🚀 Job started...');
      await this.simplelogsStart();

      // Process job.
      await processJob();

      this.endedAt = dayjs().toISOString();
      this.endedAtTimestamp = dayjs(this.endedAt).valueOf();
      this.status = this.getErrors().length ? SimplejobStatus.WARNING : SimplejobStatus.SUCCESS;

      this.addLog('✅ Job done.');
      if (this.onEnd) await this.onEnd(this.status);

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
      await this.unHandledExit(error.stack, SimplejobStatus.CRASH);
      this.status = SimplejobStatus.CRASH;
      this.addLog('💥 Job crashed.');
      console.log(this.coloredReport);
      if (this.onEnd) await this.onEnd(this.status, error);
      if (!this.disableConnect) {
        await this.disconnect();
      }
      process.exit(1);
    }
  };

  exit = async (exitCode: any) => {
    await this.disconnect();
    process.exit(exitCode);
  };

  /** Merges 2 results */
  mergeResult = (result: SimplejobResult, newResult: SimplejobResult) => {
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

  addStatsFromChild = ({ result, logs }: { result: SimplejobResult; logs: SimplejobLog[] }) => {
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
