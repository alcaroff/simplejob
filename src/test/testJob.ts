import Joi from 'joi';
import SimpleJob from '../job';

class Job extends SimpleJob {
  simplelogsToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7Il9pZCI6IjYzYmZlZjRlZGE5MGQ5M2IyM2JlNjdiMiJ9LCJpYXQiOjE2NzM1MjMwMjIsImV4cCI6MTY3NjExNTAyMn0.ckYyfJ-k7n1uny44ezAhXESXbHPr5SQnlAe_rFVHJgA';
}

const job = new Job({
  fileName: __filename,
});

job.getArgs({
  startDate: Joi.string().required(),
  endDate: Joi.string().required(),
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
job.start(async () => {
  job.addResult('notificationSent', 42);
  // job.addError(`Error on user [42]`);
  // job.addError(`Error while fetching date`);
  await wait(2000);
  job.addResult('notificationSent', 42);
  // await wait(2000);
  job.addResult('notificationSent', 42);
  await job.exportCsv('data/test1.csv', [
    { id: 42, test: 'a' },
    { id: 43, test: 'b' },
  ]);
  await job.exportCsv('data/test2.csv', [
    { id: 42, test: 'a' },
    { id: 43, test: 'b' },
  ]);

  throw new Error('Test error');
});
