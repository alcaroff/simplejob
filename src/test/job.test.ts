import SimpleJob from '../job';

describe('class Job', () => {
  it('should start job', () => {
    const job = new SimpleJob({
      filename: __filename,
    });
    job.start(async () => {
      expect(true).toBe(true);
    });
  });
});
