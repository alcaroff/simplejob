import Joi from 'joi';
import SimpleJob from './job';

const job = new SimpleJob({
  fileName: __filename,
});

job.getArgs({
  startDate: Joi.string().required(),
  endDate: Joi.string().required(),
});

job.start(async () => {
  job.addResult('notificationSent', 42);
  job.addError(`Error on user [42]`);
  job.addError(`Error while fetching date`);
});
