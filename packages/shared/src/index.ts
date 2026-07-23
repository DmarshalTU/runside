export type HubSettings = {
  owner: string;
  repo: string;
  /** Workflow file name, e.g. playwright.yml */
  workflowFile: string;
  /** Workflow display name filter for `gh run list --workflow` */
  workflowName: string;
  /** Prefix for Allure report artifacts, e.g. allure-report- */
  artifactPrefix: string;
};

export const DEFAULT_SETTINGS: HubSettings = {
  owner: "",
  repo: "",
  workflowFile: "",
  workflowName: "",
  artifactPrefix: "allure-report-",
};

export type GhStatus = {
  installed: boolean;
  authenticated: boolean;
  message: string;
  loggedInAs?: string;
};

/** Values passed to `gh workflow run -f key=value` */
export type TriggerInputValues = Record<string, string>;

/** @deprecated Prefer TriggerInputValues + WorkflowDispatchSchema */
export type TriggerInputs = TriggerInputValues;

export type WorkflowInputType = "string" | "boolean" | "choice" | "environment" | "number";

export type WorkflowInputField = {
  name: string;
  description: string;
  type: WorkflowInputType;
  required: boolean;
  defaultValue: string;
  options: string[];
};

export type WorkflowDispatchSchema = {
  workflowFile: string;
  workflowName: string;
  inputs: WorkflowInputField[];
};

export const DEFAULT_TRIGGER_INPUTS: TriggerInputValues = {
  branches: "main",
  suite: "smoke",
  grep: "",
  project: "chromium",
  shards: "1",
  include_demo_fail: "false",
};

export type WorkflowRun = {
  databaseId: number;
  displayTitle: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
  event: string;
  headBranch: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  actor?: string;
};

export type RunArtifact = {
  name: string;
  sizeInBytes?: number;
  expired: boolean;
  /** Local cache path relative to hub data dir, if downloaded */
  cached: boolean;
  reportUrl?: string;
};

export type RunDetail = WorkflowRun & {
  artifacts: RunArtifact[];
};

export type WorkflowJobStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
};

export type WorkflowJob = {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  url: string;
  steps: WorkflowJobStep[];
};

export type RunLogs = {
  runId: string;
  jobId?: number;
  jobName?: string;
  /** Raw CI log text (may be truncated) */
  text: string;
  truncated: boolean;
  available: boolean;
  message?: string;
};

export type ApiError = {
  error: string;
  detail?: string;
};

export type DownloadResult = {
  name: string;
  reportUrl: string;
  cached: boolean;
};

export type DispatchResult = {
  ok: true;
  message: string;
};
