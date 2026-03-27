import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCvAndCl } from "@/lib/claude";

export async function POST(req: Request) {
	const session = await auth();
	if (!session?.user?.id)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { jobId } = await req.json();

	const [job, userCv, profile] = await Promise.all([
		db.job.findFirst({ where: { id: jobId, userId: session.user.id } }),
		db.cV.findFirst({ where: { userId: session.user.id } }),
		db.profile.findUnique({ where: { userId: session.user.id } }),
	]);

	if (!job)
		return NextResponse.json({ error: "Job not found" }, { status: 404 });
	if (!userCv)
		return NextResponse.json(
			{ error: "No CV found. Please add your CV first." },
			{ status: 400 },
		);

	const languages: { name: string; level: string }[] = profile?.languages
		? JSON.parse(profile.languages)
		: [];
	const keywords: string[] = profile?.keywords
		? JSON.parse(profile.keywords)
		: [];

	const profileContext = profile
		? `
CANDIDATE PROFILE:
- Years of experience: ${profile.totalYearsExperience ?? "unknown"}
- Seniority: ${profile.seniority ?? "unknown"}
- Current location: ${profile.currentLocation ?? "unknown"}
- Preferred locations: ${profile.preferredLocations ?? "any"}
- Notice period: ${profile.noticePeriod ?? "unknown"}${languages.length > 0 ? `\n- Languages: ${languages.map((l) => `${l.name} (${l.level})`).join(", ")}` : ""}${keywords.length > 0 ? `\n- Key skills/keywords to emphasize: ${keywords.join(", ")}` : ""}
`
		: "";

	// Mark as generating
	await db.job.update({
		where: { id: jobId },
		data: { agentStatus: "generating" },
	});

	const candidateName = profile?.fullName || session.user?.name || "Candidate";
	const linkedinUrl = profile?.linkedinUrl ?? undefined;
	const githubUrl = profile?.githubUrl ?? undefined;

	let result = await generateCvAndCl(
		userCv.latexSource,
		job.description ?? "",
		job.title,
		job.company,
		1,
		undefined,
		undefined,
		profileContext,
		candidateName,
		linkedinUrl,
		githubUrl,
	);

	// Pass 2 if needed
	if (
		result.atsBreakdown.decision === "NEEDS_REVISION" &&
		result.atsScore >= 70
	) {
		await db.job.update({
			where: { id: jobId },
			data: { agentStatus: "reviewing" },
		});
		result = await generateCvAndCl(
			userCv.latexSource,
			job.description ?? "",
			job.title,
			job.company,
			2,
			result.resume,
			result.atsScore,
			profileContext,
			candidateName,
			linkedinUrl,
			githubUrl,
		);
	}

	// Pass 3 if still needs revision
	if (
		result.atsBreakdown.decision === "NEEDS_REVISION" &&
		result.atsScore >= 70
	) {
		result = await generateCvAndCl(
			userCv.latexSource,
			job.description ?? "",
			job.title,
			job.company,
			3,
			result.resume,
			result.atsScore,
			profileContext,
			candidateName,
			linkedinUrl,
			githubUrl,
		);
	}

	const finalStatus = result.atsScore < 70 ? "rejected" : "done";

	// Build a compilable document: preamble + header + generated body
	const baseLatex = userCv.latexSource;
	const beginDocIdx = baseLatex.indexOf("\\begin{document}");
	const endDocIdx = baseLatex.lastIndexOf("\\end{document}");
	const preamble = beginDocIdx !== -1 ? baseLatex.slice(0, beginDocIdx) : "";

	// Extract header: content between \begin{document} and first \section or \begin{section}
	const bodyStart =
		beginDocIdx !== -1 ? beginDocIdx + "\\begin{document}".length : 0;
	const bodyContent =
		endDocIdx !== -1
			? baseLatex.slice(bodyStart, endDocIdx)
			: baseLatex.slice(bodyStart);
	const firstSectionIdx = bodyContent.search(/\\section|\\begin\{section\}/);
	let header =
		firstSectionIdx !== -1 ? bodyContent.slice(0, firstSectionIdx).trim() : "";
	// Strip LinkedIn URL line from header
	header = header
		.replace(/.*linkedin\.com[^\n\\]*/gi, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	// Strip document-level commands and anything after \end{document}
	let cleanBody = result.resume;
	const endDocMatch = cleanBody.indexOf("\\end{document}");
	if (endDocMatch !== -1) cleanBody = cleanBody.slice(0, endDocMatch);
	cleanBody = cleanBody
		.replace(/\\documentclass[^\n]*/g, "")
		.replace(/\\usepackage[^\n]*/g, "")
		.replace(/\\begin\{document\}/g, "")
		.replace(/^```[a-z]*\n?/im, "")
		.replace(/```\s*$/m, "")
		.trim();

	// Strip header block if Claude included it (lines before first \section)
	const firstSection = cleanBody.search(/\\section/);
	if (firstSection > 50) cleanBody = cleanBody.slice(firstSection);

	// Guard: if Claude returned an empty/unparseable body, fall back to the base CV body sections
	const isEmptyBody = cleanBody.length < 100;
	if (isEmptyBody) {
		const baseBodyStart =
			beginDocIdx !== -1 ? beginDocIdx + "\\begin{document}".length : 0;
		const baseBodyEnd = endDocIdx !== -1 ? endDocIdx : baseLatex.length;
		cleanBody = baseLatex.slice(baseBodyStart, baseBodyEnd).trim();
	}

	const fullCv = preamble
		? isEmptyBody
			? `${preamble}\\begin{document}\n${cleanBody}\n\\end{document}`
			: `${preamble}\\begin{document}\n${header}\n${cleanBody}\n\\end{document}`
		: result.resume;

	const updated = await db.job.update({
		where: { id: jobId },
		data: {
			agentStatus: finalStatus,
			atsScore: result.atsScore,
			atsBreakdown: JSON.stringify(result.atsBreakdown),
			generatedCv: fullCv,
			generatedCl: result.coverLetter,
			generatedAt: new Date(),
		},
	});

	return NextResponse.json(updated);
}
