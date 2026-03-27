import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchLinkedInJobs, ApifyJob } from "@/lib/apify";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const datePosted: string = body.datePosted ?? "week";

    const [positions, profile] = await Promise.all([
      db.position.findMany({ where: { userId: session.user.id } }),
      db.profile.findUnique({ where: { userId: session.user.id } }),
    ]);

    if (positions.length === 0) {
      return NextResponse.json(
        { error: "No positions configured. Add some in the Positions tab first." },
        { status: 400 }
      );
    }

    const countryCodes: string[] = profile?.preferredLocations
      ? JSON.parse(profile.preferredLocations)
      : [];

    const jobTypes: string[] = profile?.jobTypes
      ? JSON.parse(profile.jobTypes)
      : ["fulltime"];

    let jobs: ApifyJob[];
    try {
      jobs = await fetchLinkedInJobs(
        positions.map((p) => p.label),
        countryCodes,
        datePosted,
        jobTypes
      );
    } catch (e) {
      console.error("[sync] Apify error:", e);
      return NextResponse.json({ error: "Apify error: " + String(e) }, { status: 500 });
    }

    const existingRows = await db.job.findMany({
      where: { userId: session.user.id },
      select: { url: true },
    });
    const existingUrls = new Set(
      existingRows
        .map((j) => j.url?.split("?")[0])
        .filter((u): u is string => u != null)
    );

    const newJobs = jobs.filter((j) => !existingUrls.has(j.url?.split("?")[0]));

    if (newJobs.length > 0) {
      await db.job.createMany({
        data: newJobs.map((j) => ({
          userId: session.user.id,
          title: j.title,
          company: j.company,
          location: j.location,
          description: j.description,
          url: j.url,
          salary: j.salary,
          jobType: j.jobType ?? j.seniorityLevel,
          agentStatus: "pending",
          applicationStatus: "new",
        })),
      });
    }

    return NextResponse.json({
      inserted: newJobs.length,
      skipped: jobs.length - newJobs.length,
    });
  } catch (e) {
    console.error("[sync]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
