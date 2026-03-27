import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { JobsClientWrapper } from "@/components/jobs/jobs-client-wrapper";

export default async function JobsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const rawJobs = await db.job.findMany({
    where: { userId: session.user.id },
    orderBy: { fetchedAt: "desc" },
  });

  // Serialize dates for client component
  const jobs = rawJobs.map((j) => ({
    ...j,
    generatedAt: j.generatedAt?.toISOString() ?? null,
    applicationDate: j.applicationDate?.toISOString() ?? null,
    fetchedAt: j.fetchedAt.toISOString(),
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  }));

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jobs</h1>
      </div>
      <JobsClientWrapper initialJobs={jobs} />
    </div>
  );
}
