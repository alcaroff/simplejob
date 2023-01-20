import Joi from 'joi';
import SimpleJob from '../job';

const job = new SimpleJob({
  fileName: __filename,
});

job.getArgs({
  startDate: Joi.string().required(),
  endDate: Joi.string().required(),
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
job.start(async () => {
  job.addResult('notificationSent', 42);
  job.addError(`Error on user [42]`);
  job.addError(`Error while fetching date`);
  await wait(2000);
  job.addResult('notificationSent', 42);
  await wait(10000);
  job.addResult('notificationSent', 42);
  job.exportData('data/test.json', 'Hello World');
});
