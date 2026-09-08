export class AnalysisWorker {
  constructor({ repository, processor, maxAttempts = 5, clock = () => new Date() }) {
    this.repository = repository; this.processor = processor; this.maxAttempts = maxAttempts; this.clock = clock;
    this.running = false;
  }
  async runOnce() {
    if (this.running) return { claimed: 0, skipped: 'already_running' };
    this.running = true;
    try {
      const jobs = await this.repository.claimAnalysisJobs({ limit: 1 });
      for (const job of jobs) {
      try {
        const prepared = await this.processor.prepare(job.leadId);
        await this.repository.applyAnalysisJobResult(job, prepared);
      } catch (error) {
        const delay = Math.min(300_000, 5_000 * (2 ** Math.max(0, Number(job.attemptCount) - 1)));
        await this.repository.failAnalysisJob(job, { nextAttemptAt: new Date(this.clock().getTime()+delay), error:error?.message??error, maxAttempts:this.maxAttempts });
      }
      }
      return { claimed: jobs.length };
    } finally { this.running = false; }
  }
}
