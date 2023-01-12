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
import SimpleJob from "simplejob";

class MyJob extends SimpleJob {
  async connect() {
    // your database connection
  }

  async disconnect() {
    // your database connection
  }
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
"coutry" is required
Usage: "node myjob [language] <city> <--confirm>"
```

> 💡 Note: for now, compatible Joi package is "17.4.0"

## API

🚧 Still in construction...

### SimpleJob Class api

| property          | description                                   | type                                                      | default              |
| ----------------- | --------------------------------------------- | --------------------------------------------------------- | -------------------- |
| timeformat        | Format of time to be displayed in logs        | [dayjs format](https://day.js.org/docs/en/display/format) | 'hh:mm:ss'           |
| env               | Environment of the job                        | string \| undefined                                       | process.env.NODE_ENV |
| args              | Arguments of the job                          | object                                                    | {}                   |
| reportErrorsLimit | Limit of errors to be displayed in the report | number                                                    | 6                    |

### SimpleJob constructor options

Used as `new SimpleJob(options)`

| property       | description                                                        | type                | default |
| -------------- | ------------------------------------------------------------------ | ------------------- | ------- |
| maintainer     | Name of the maintainer of the job                                  | string \| undefined |         |
| filename       | Full path of the file (\_\_filename)                               | string              |         |
| disableReport  | Disable the report at the end of the job                           | boolean             | false   |
| disableConnect | Disable the connect/disconnect methods at the start/end of the job | boolean             | false   |
