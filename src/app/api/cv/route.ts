import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cv = await db.cV.findFirst({ where: { userId: session.user.id } });
    return NextResponse.json(cv ?? { latexSource: "" });
  } catch (e) {
    console.error("[cv GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { latexSource } = await req.json();
    const cv = await db.cV.upsert({
      where: { userId: session.user.id },
      update: { latexSource },
      create: { userId: session.user.id, latexSource },
    });
    return NextResponse.json(cv);
  } catch (e) {
    console.error("[cv POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
