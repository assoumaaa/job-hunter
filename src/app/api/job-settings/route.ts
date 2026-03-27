import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
    return NextResponse.json({
      preferredLocations: profile?.preferredLocations ?? null,
      jobTypes: profile?.jobTypes ?? null,
      keywords: profile?.keywords ?? null,
    });
  } catch (e) {
    console.error("[job-settings GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = {
      preferredLocations: body.preferredLocations ?? null,
      jobTypes: body.jobTypes ?? null,
      keywords: body.keywords ?? null,
    };

    const profile = await db.profile.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { userId: session.user.id, ...data },
    });

    return NextResponse.json({
      preferredLocations: profile.preferredLocations,
      jobTypes: profile.jobTypes,
      keywords: profile.keywords,
    });
  } catch (e) {
    console.error("[job-settings POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
