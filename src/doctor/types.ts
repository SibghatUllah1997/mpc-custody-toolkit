export type DoctorKind = 'share' | 'audit' | 'spent' | 'queue';

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
  records?: number;
  items?: number;
  ready?: number;
  expired?: number;
};

export type DoctorReport = {
  ok: boolean;
  checks: DoctorCheck[];
};

export type DoctorTargets = {
  shares?: string[];
  audit?: string;
  spent?: string;
  queue?: string;
  password?: string;
};
