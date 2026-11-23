export type DoctorKind = 'share' | 'audit';

export type DoctorCheck = {
  ok: boolean;
  kind: DoctorKind;
  target: string;
  codes: string[];
  detail: string;
  encrypted?: boolean;
  x?: number;
  setId?: string;
  sourceVersion?: number;
  events?: number;
  shareCount?: number;
  threshold?: number;
};

export type DoctorReport = {
  ok: boolean;
  checks: DoctorCheck[];
};

export type DoctorTargets = {
  shares?: string[];
  audit?: string;
  password?: string;
};
