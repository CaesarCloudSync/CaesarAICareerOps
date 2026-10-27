import React, { useState, useEffect } from 'react';
import PipelineProgressCard from './PipelineProgressCard';

export default function GlobalActiveJobsBanner({ onJobCompleted }) {
  const [activeAutofillJobs, setActiveAutofillJobs] = useState([]);
  const [activeEvalJob, setActiveEvalJob] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const pollActiveJobs = async () => {
      try {
        const [autofillRes, evalRes] = await Promise.all([
          fetch('/api/autofill/jobs/active').catch(() => null),
          fetch('/api/evaluate/job/active').catch(() => null),
        ]);

        if (autofillRes && autofillRes.ok && isMounted) {
          const aData = await autofillRes.json();
          const jobs = aData.jobs || (aData.job ? [aData.job] : []);
          setActiveAutofillJobs(jobs);

          // If any job just completed, inform parent
          const justCompleted = jobs.some((j) => j.status === 'completed');
          if (justCompleted) onJobCompleted?.();
        }

        if (evalRes && evalRes.ok && isMounted) {
          const eData = await evalRes.json();
          if (eData.active && eData.job) {
            setActiveEvalJob(eData.job);
          } else {
            setActiveEvalJob(null);
          }
        }
      } catch (err) {
        // silent background poll
      }
    };

    pollActiveJobs();
    const interval = setInterval(pollActiveJobs, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [onJobCompleted]);

  const handleCancelAutofillJob = async (jobId) => {
    try {
      await fetch(`/api/autofill/job/${jobId}/cancel`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to cancel autofill job:', e);
    }
  };

  const handleCancelEvalJob = async (jobId) => {
    try {
      await fetch(`/api/evaluate/job/${jobId}/cancel`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to cancel eval job:', e);
    }
  };

  const hasAnyJobs = (activeAutofillJobs && activeAutofillJobs.length > 0) || activeEvalJob;
  if (!hasAnyJobs) return null;

  return (
    <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Active Evaluation Job Card */}
      {activeEvalJob && (
        <PipelineProgressCard
          title={
            activeEvalJob.status === 'completed'
              ? 'Evaluation Complete'
              : activeEvalJob.status === 'cancelled'
              ? 'Evaluation Cancelled'
              : activeEvalJob.status === 'failed'
              ? 'Evaluation Failed'
              : activeEvalJob.total === 1
              ? 'Evaluating Role...'
              : `Batch Evaluating Role ${activeEvalJob.current_index || 1} of ${activeEvalJob.total}`
          }
          status={activeEvalJob.status}
          elapsedSeconds={activeEvalJob.elapsed_seconds || 0}
          percent={
            activeEvalJob.status === 'completed'
              ? 100
              : Math.round(((activeEvalJob.current_index || 0) / (activeEvalJob.total || 1)) * 100)
          }
          badge={`${activeEvalJob.completed_count || 0} completed • ${activeEvalJob.failed_count || 0} failed`}
          tag={`Job: ${activeEvalJob.job_id}`}
          currentTarget={activeEvalJob.current_target}
          detail={activeEvalJob.detail}
          onCancel={() => handleCancelEvalJob(activeEvalJob.job_id)}
        />
      )}

      {/* Active Autofill & HTML Compilation Jobs (Both Running and Queued) */}
      {activeAutofillJobs.map((job) => {
        const isCompilation = job.job_type === 'compile_html';
        const isQueued = job.status === 'queued';
        const isCompleted = job.status === 'completed';

        let title = '';
        if (isCompilation) {
          title = isCompleted
            ? 'AI HTML Compilation Complete'
            : isQueued
            ? 'Queued: Waiting for Previous Compilation...'
            : 'Compiling Form HTML & Drafting Answers with agy...';
        } else {
          title = isCompleted
            ? 'AI Autofill Complete'
            : isQueued
            ? 'Autofill Queued...'
            : (job.total || 1) === 1
            ? 'AI Autofill in Progress...'
            : `Batch Autofill: Application ${job.current_index || 1} of ${job.total || 1}`;
        }

        let percent = 0;
        if (isCompleted || job.status === 'cancelled' || job.status === 'failed') {
          percent = 100;
        } else if (isQueued) {
          percent = 5;
        } else if (isCompilation || (job.total || 1) === 1) {
          percent = Math.min(95, Math.max(15, Math.round((job.elapsed_seconds || 1) * 6)));
        } else {
          percent = Math.round(((job.current_index || 0) / (job.total || 1)) * 100);
        }

        return (
          <PipelineProgressCard
            key={job.job_id}
            title={title}
            status={job.status}
            elapsedSeconds={job.elapsed_seconds || 0}
            percent={percent}
            badge={isCompilation ? 'AI Compiler (agy)' : 'AI Autofill (agy)'}
            tag={`Job: ${job.job_id}`}
            currentTarget={job.current_target}
            detail={job.detail || 'Contextual AI reasoning with agy...'}
            onCancel={() => handleCancelAutofillJob(job.job_id)}
          />
        );
      })}
    </div>
  );
}
