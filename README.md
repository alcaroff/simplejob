# simplejob

A tool class to wrap your jobs/scripts and easily get reports like 👇

```
+----------------------  JOB REPORT  ----------------------+
👷  JOB  =>  myjob
📁  PATH  => /Users/alex/Documents/myproject/myjob.js
⚙️  STATUS  =>  warning
⏰  DURATION  =>  5.128s
👨‍💻  ENV  =>  prod
💬  ARGS  =>
	startDate:  2023-01-12
	endDate:  2023-01-14
📊  RESULTS  =>
	sentNotifications:  29
+----------------------------------------------------------+
```

## Installaton

```sh
yarn add simplejob
# or
npm i -S simplejob
```

```ts
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
invalid param: "country"
usage: "node myjob [language] <city> <--confirm>"
```

> 💡 Note: for now, compatible Joi package is "17.4.0"

## API

🚧 Still in construction...

| property | description | type | default |
| -------- | ----------- | ---- | ------- |
|          |             |      |         |
