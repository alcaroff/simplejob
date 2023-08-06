import { Simplejob } from '../Simplejob';

describe('class Job', () => {
  it('should start job', () => {
    const job = new Simplejob({
      __filename,
    });
    job.start(async () => {
      expect(true).toBe(true);
    });
  });
});
