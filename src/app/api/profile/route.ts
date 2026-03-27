import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
	try {
		const session = await auth();
		if (!session?.user?.id)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

		const profile = await db.profile.findUnique({
			where: { userId: session.user.id },
		});
		// Seed fullName from account if not set
		const fullName = profile?.fullName ?? session.user.name ?? "";
		return NextResponse.json({ ...(profile ?? {}), fullName });
	} catch (e) {
		console.error("[profile GET]", e);
		return NextResponse.json({ error: String(e) }, { status: 500 });
	}
}

export async function POST(req: Request) {
	try {
		const session = await auth();
		if (!session?.user?.id)
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

		const body = await req.json();
		const data = {
			fullName: body.fullName || null,
			linkedinUrl: body.linkedinUrl || null,
			githubUrl: body.githubUrl || null,
			totalYearsExperience: body.totalYearsExperience ?? null,
			seniority: body.seniority || null,
			currentLocation: body.currentLocation || null,
			noticePeriod: body.noticePeriod || null,
			languages: body.languages || null,
		};

		const profile = await db.profile.upsert({
			where: { userId: session.user.id },
			update: data,
			create: { userId: session.user.id, ...data },
		});

		return NextResponse.json(profile);
	} catch (e) {
		console.error("[profile POST]", e);
		return NextResponse.json({ error: String(e) }, { status: 500 });
	}
}
