"use client";

import dynamic from "next/dynamic";
import type { Job } from "./jobs-client";

const JobsClient = dynamic(
  () => import("./jobs-client").then((m) => m.JobsClient),
  { ssr: false }
);

export function JobsClientWrapper({ initialJobs }: { initialJobs: Job[] }) {
  return <JobsClient initialJobs={initialJobs} />;
}
