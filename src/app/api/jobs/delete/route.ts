import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    await db.job.deleteMany({
      where: { id: { in: ids }, userId: session.user.id },
    });

    return NextResponse.json({ deleted: ids.length });
  } catch (e) {
    console.error("[jobs/delete]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
