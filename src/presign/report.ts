import type { PreSignReason, PreSignResult, PreSignStage } from './types.js';

export type StageStatus = 'pass' | 'fail' | 'skipped';

export type PreSignReport = {
  ready: boolean;
  stages: {
    transaction: StageStatus;
    approval: StageStatus;
    policy: StageStatus;
    simulation: StageStatus;
  };
  /** Stable one-line status for logs and later CLI output. */
  summary: string;
};

function hasStage(reasons: PreSignReason[], stage: PreSignStage): boolean {
  return reasons.some((r) => r.stage === stage);
}

function transactionStatus(result: PreSignResult): StageStatus {
  if (hasStage(result.reasons, 'transaction')) return 'fail';
  if (result.tx) return 'pass';
  return 'skipped';
}

function approvalStatus(result: PreSignResult): StageStatus {
  if (hasStage(result.reasons, 'approval')) return 'fail';
  if (result.queue?.ready) return 'pass';
  return 'skipped';
}

function policyStatus(result: PreSignResult): StageStatus {
  if (hasStage(result.reasons, 'policy')) return 'fail';
  if (result.policy?.allowed) return 'pass';
  return 'skipped';
}

function simulationStatus(result: PreSignResult): StageStatus {
  if (hasStage(result.reasons, 'simulation')) return 'fail';
  if (result.simulation) return 'pass';
  return 'skipped';
}

function formatReasons(reasons: PreSignReason[]): string {
  return reasons.map((r) => `${r.stage}:${r.code}`).join(', ');
}

/**
 * Collapse a pre-sign result into stage statuses and a one-line summary.
 * Does not re-run checks; it only reads the already-computed result.
 */
export function buildPreSignReport(result: PreSignResult): PreSignReport {
  const stages = {
    transaction: transactionStatus(result),
    approval: approvalStatus(result),
    policy: policyStatus(result),
    simulation: simulationStatus(result),
  };
  const ready =
    result.ok === true &&
    stages.transaction === 'pass' &&
    (stages.approval === 'pass' || stages.approval === 'skipped') &&
    stages.policy === 'pass' &&
    (stages.simulation === 'pass' || stages.simulation === 'skipped');
  let summary: string;
  if (ready) {
    const approvals = result.policy?.approvalCount ?? 0;
    if (result.simulation) {
      summary = `ready: ${result.simulation.gasUnits} gas, fee ${result.simulation.fee}, ${approvals} approvals`;
    } else {
      summary = `ready: ${approvals} approvals`;
    }
  } else if (result.reasons.length === 0) {
    summary = 'blocked: incomplete pre-sign result';
  } else {
    summary = `blocked: ${formatReasons(result.reasons)}`;
  }
  return Object.freeze({
    ready,
    stages: Object.freeze(stages),
    summary,
  });
}
