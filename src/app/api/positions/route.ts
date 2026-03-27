import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const positions = await db.position.findMany({ where: { userId: session.user.id } });
  return NextResponse.json(positions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { label } = await req.json();
  const position = await db.position.create({
    data: { userId: session.user.id, label },
  });
  return NextResponse.json(position);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await db.position.delete({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
