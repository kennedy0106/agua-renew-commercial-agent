export class AnalysisWorker {
  constructor({ repository, processor, maxAttempts = 5, clock = () => new Date() }) {
    this.repository = repository; this.processor = processor; this.maxAttempts = maxAttempts; this.clock = clock;
  }
  async runOnce({ limit = 10 } = {}) {
    const jobs = await this.repository.claimAnalysisJobs({ limit });
    for (const job of jobs) {
      try {
        await this.processor.process(job.leadId);
        await this.repository.completeAnalysisJob(job.leadId, Number(job.requestedVersion));
      } catch (error) {
        const delay = Math.min(300_000, 5_000 * (2 ** Math.max(0, Number(job.attemptCount) - 1)));
        await this.repository.failAnalysisJob(job.leadId, Number(job.requestedVersion), { nextAttemptAt: new Date(this.clock().getTime()+delay), error:error?.message??error, maxAttempts:this.maxAttempts });
      }
    }
    return { claimed: jobs.length };
  }
}
