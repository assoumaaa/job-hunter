import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Fix jobs stuck in generating/reviewing that already have a CV
		await db.job.updateMany({
			where: {
				userId: session.user.id,
				agentStatus: { in: ["generating", "reviewing"] },
				generatedCv: { not: null },
			},
			data: { agentStatus: "done" },
		});

		const jobs = await db.job.findMany({
			where: { userId: session.user.id },
			orderBy: { fetchedAt: "desc" },
		});

		return NextResponse.json(jobs);
	} catch (e) {
		console.error("[jobs GET]", e);
		return NextResponse.json({ error: String(e) }, { status: 500 });
	}
}

export async function PATCH(req: Request) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const { id, ...data } = await req.json();
		const job = await db.job.update({
			where: { id, userId: session.user.id },
			data,
		});
		return NextResponse.json(job);
	} catch (e) {
		console.error("[jobs PATCH]", e);
		return NextResponse.json({ error: String(e) }, { status: 500 });
	}
}
