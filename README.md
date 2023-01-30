# simplejob

A tool class to wrap your jobs/scripts and easily get logs and reports like 👇

```
[12:11:49] 🚀 Job started...
[12:11:49] Error on user [42]
[12:11:49] Error while fetching date
[12:11:49] ✅ Job done.
+------------------- Job report ---------------------+
👷 Job >  testJob
📁 Path > /Users/alex/Documents/perso/simplelogs-package/src/testJob.ts
🚦 Status >  warning
⏰ Duration >  0.004s
💬 Args >
        - startDate: "2021-10-10"
        - endDate: "2023-10-10"
📊 Results >
        - notificationSent: 42
🚩 Errors >
        - Error on user [42]
        - Error while fetching date
+------------------------------------------------------+
```

## Installaton

```sh
yarn add simplejob
# or
npm i -S simplejob
```

```ts
import { SimpleJob, JobStatus } from "simplejob";

class MyJob extends SimpleJob {
  connect = async () => {
    // your database connection
  };

  disconnect = async () => {
    // your database connection
  };

  onDone = async (status: JobStatus, error: any) => {
    // your custom actions
  };
}
```

## Usage

### Create your job

```ts
const job = new MyJob({
  maintainer: "John Doe",
  filename: __filename,
});

job.start(async () => {
  // Your job operations...
});
```

### Adding results/errors/logs

```ts
job.addResult("userMigrated"); // Adding 1 result.
job.addResult("userMigrated", 42); // Adding 42 results.

job.addError(`Error on user ${user.id}`, { userId: user.id }); // Adding an error with data.

job.addLog(`${user.id} migrated`);
```

### Getting args

`getArgs` helps you getting args params, logging errors and usage using Joi.

```ts
const args = job.getArgs<{
  country: "france" | "usa";
  city?: string;
  confirm?: boolean;
}>(
  {
    country: Joi.string().valid("usa").valid("france").required(),
    city: Joi.string(),
  },
  {
    confirm: Joi.boolean(),
  }
);
```

will log

```sh
> node myjob germany orleans
"country" is invalid
Usage: "node myjob <country> [city] [--confirm]"
```

> 💡 Note: for now, compatible Joi package is "17.4.0"

### Exporting csv

```ts
await job.exportCsv(`${__dirname}/data/user_data.csv`, [
  { id: 1, name: "John" },
  { id: 2, name: "Jane" },
]);
```

Will write a csv file using writeStream (create path if it doesn't exist).

## Incoming...

_This package doc and Class is still in construction, some features are coming in next versions!_
`fork children, getArgs without Joi, exportJson, saveReport, customizations...`

## API

🚧 In construction...

### SimpleJob Class api

| property           | description                                                        | type                                                                                                                     | default                |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| connect            | Connect function called before job execution                       | `async () => void`                                                                                                       |                        |
| disconnect         | Disconnect function called after the job execution                 | `async () => void`                                                                                                       |                        |
| onEnd              | Function called after the job execution                            | `async (status: JobStatus, error?: any) => void`                                                                         |                        |
| start              | Start                                                              | `async (async () => any) => void`                                                                                        |                        |
| status             | Actual status of the job instance                                  | `'pending'` &#124; `'running'` &#124; `'warning'` &#124; `'success'` &#124; `'error'` &#124; `'exit'` &#124; `'pending'` |
| timeformat         | Format of time to be displayed in logs                             | [dayjs format](https://day.js.org/docs/en/display/format)                                                                | `'hh:mm:ss'`           |
| env                | Environment of the job                                             | `string` &#124; `undefined`                                                                                              | `process.env.NODE_ENV` |
| getArgs            | Get args and return an object of it                                | `(params, namedParams) => object`                                                                                        | `function`             |
| exportCsv          | Export csv data in a file (create dir)                             | `(path, data) => void`                                                                                                   | `function`             |
| addError           | Add an error                                                       | `(message: string, data: any) => void`                                                                                   | `function`             |
| addLog             | Add a log                                                          | `(message: string, data: any) => void`                                                                                   | `function`             |
| args               | Arguments object filled with `.getArgs`                            | `object`                                                                                                                 | `{}`                   |
| logs               | Logs filled with `.addError` and `.addLog`                         | `JobLog[]`                                                                                                               | `[]`                   |
| results            | Results filled with `.addResult`                                   | `JobResult[] `                                                                                                           | `[]`                   |
| reportErrorsLimit  | Limit of errors to be displayed in the report                      | `number`                                                                                                                 | `6`                    |
| disableReport      | Disable the report at the end of the job                           | `boolean`                                                                                                                | `false`                |
| disableConnect     | Disable the connect/disconnect methods at the start/end of the job | `boolean`                                                                                                                | `false`                |
| maintainer         | Name of the maintainer                                             | `string` &#124; `undefined`                                                                                              |                        |
| scriptName         | Name of the file (deducted from constructor option `filename`)     | `string`                                                                                                                 |                        |
| scriptPath         | Full path (equal from constructor option `filename`)               | `string`                                                                                                                 |                        |
| description        | Description of the job                                             | `string`                                                                                                                 |                        |
| maintainer         | name of the author/maintainer                                      | `string`                                                                                                                 |                        |
| startedAt          | Date of the start of the job                                       | `Date`                                                                                                                   |                        |
| endedAt            | Date of the end of the job                                         | `Date`                                                                                                                   |                        |
| startedAtTimestamp | Timestamp of the start of the job                                  | `number`                                                                                                                 |                        |
| endedAtTimestamp   | Timestamp of the end of the job                                    | `number`                                                                                                                 |                        |
| simplelogsToken    | Token to be used to send logs to simplelogs (incoming)             | `string` &#124; `undefined`                                                                                              |                        |
| tags               | Tags to be used to send logs to simplelogs (incoming)              | `string[]` &#124; `undefined`                                                                                            |                        |
| thread             | Thread for simplelogs app (incoming)                               | `string`                                                                                                                 |                        |

### SimpleJob constructor options

Options used with constructor call 👉 `const job = new SimpleJob(options)`

| property | description                          | type     | required |
| -------- | ------------------------------------ | -------- | -------- |
| filename | Full path of the file (`__filename`) | `string` | [x]      |

```

```
