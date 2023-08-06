import Joi from 'joi';
import { Simplejob } from '../Simplejob';

class Job extends Simplejob {
  // simplelogsToken =
  // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7Il9pZCI6IjYzYmZlZjRlZGE5MGQ5M2IyM2JlNjdiMiJ9LCJpYXQiOjE2NzM1MjMwMjIsImV4cCI6MTY3NjExNTAyMn0.ckYyfJ-k7n1uny44ezAhXESXbHPr5SQnlAe_rFVHJgA';
}

const job = new Job({
  __filename,
  tags: ['mpg', 'notification'],
  thread: 'Notifications',
});

const args = job.getArgs<{ startDate: string; endDate: string; confirm?: boolean }>([
  {
    name: 'startDate',
    validate: (value) => Joi.string().validate(value).error?.message,
    default: '2021-09-01',
  },
  {
    name: 'endDate',
    validate: (value) => Joi.string().validate(value).error?.message,
    default: '2021-09-01',
  },
  {
    name: '--confirm', // will be in args.confirm
    aliases: ['-c', '-b'], // will be in args.confirm too
    validate: (value) => Joi.boolean().validate(value).error?.message,
    // optional: true,
  },
]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
job.start(async () => {
  console.log(args);
  job.addResult('notificationSent', 42);
  job.addError(`Error on user [42]`);
  job.addError(`Error while fetching date`);
  await wait(10000);
  job.addLog('test', 'test');
  job.addResult('notificationSent', 42);
  // await wait(2000);
  job.addResult('notificationSent', 42);

  // throw new Error('Test error');
});
