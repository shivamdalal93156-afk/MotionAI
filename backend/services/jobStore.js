// Simple in-memory job store
// Each job: { id, status, progress, message, outputPath, createdAt, updatedAt }

const jobs = new Map();

function createJob(id) {
  const job = {
    id,
    status: 'queued',       // queued | processing | done | error
    progress: 0,
    message: 'Job queued...',
    outputPath: null,
    outputUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(id, job);
  return job;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;
  const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
  jobs.set(id, updated);
  return updated;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function getAllJobs() {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

module.exports = { createJob, updateJob, getJob, getAllJobs };
