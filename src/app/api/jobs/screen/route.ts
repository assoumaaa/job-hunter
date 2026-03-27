import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const anthropic = new Anthropic();

// Top intro + bottom requirements to stay within token budget
function smartSnippet(text: string): string {
  if (!text || text.length <= 800) return text;
  return text.slice(0, 350) + "\n[...]\n" + text.slice(-450);
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const selectedIds: string[] | undefined =
    body.ids?.length > 0 ? body.ids : undefined;

  const [unscreened, positions, profile] = await Promise.all([
    db.job.findMany({
      where: {
        userId: session.user.id,
        ...(selectedIds
          ? { id: { in: selectedIds } }
          : { relevanceStatus: "unscreened" }),
      },
      select: { id: true, title: true, company: true, description: true },
    }),
    db.position.findMany({ where: { userId: session.user.id } }),
    db.profile.findUnique({ where: { userId: session.user.id } }),
  ]);

  if (unscreened.length === 0) {
    return NextResponse.json({ screened: 0, relevant: 0, irrelevant: 0 });
  }

  if (positions.length === 0) {
    return NextResponse.json(
      { error: "No positions configured." },
      { status: 400 }
    );
  }

  const positionLabels = positions.map((p) => p.label).join(", ");
  const seniority = profile?.seniority ?? "";
  const yearsExp = profile?.totalYearsExperience ?? null;
  const keywords: string[] = profile?.keywords ? JSON.parse(profile.keywords) : [];
  const languages: { name: string; level: string }[] = profile?.languages
    ? JSON.parse(profile.languages)
    : [];

  const BATCH = 20;
  let results: { id: string; fit: string }[] = [];

  try {
    for (let i = 0; i < unscreened.length; i += BATCH) {
      const batch = unscreened.slice(i, i + BATCH);
      const jobList = batch
        .map(
          (j) =>
            `ID:${j.id} | "${j.title}" at ${j.company}\n${smartSnippet(j.description ?? "")}`,
        )
        .join("\n\n---\n\n");

      // Instructions at the bottom (avoids "lost in the middle" bias)
      const prompt = `You are a job relevance screener.

### CANDIDATE PROFILE ###
Target roles: ${positionLabels}
Seniority: ${seniority || "not specified"}${yearsExp != null ? `\nYears of experience: ${yearsExp}` : ""}${keywords.length > 0 ? `\nKey skills: ${keywords.join(", ")}` : ""}${languages.length > 0 ? `\nLanguages: ${languages.map((l) => `${l.name} (${l.level})`).join(", ")}` : ""}

### JOBS TO SCREEN ###
${jobList}

### INSTRUCTIONS ###
Classify each job as "good_fit", "maybe", or "irrelevant".
Hard rules:
- If the job requires a mandatory technology or domain NOT in the candidate's skills, classify as "irrelevant".
- If seniority is way off (e.g. candidate is mid-level, job requires 8+ years), classify as "irrelevant".
- "maybe" = related field but partial mismatch (different specialization, slightly off seniority).
- "good_fit" = role, seniority, and tech stack all align with candidate profile.
Output ONLY a JSON array: [{"id":"...","fit":"good_fit"}, ...]`;

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const raw =
        response.content[0].type === "text"
          ? response.content[0].text.trim()
          : "[]";

      const batchResults = JSON.parse(stripFences(raw));
      results = results.concat(batchResults);
    }
  } catch (e) {
    console.error("[screen] Claude error:", e);
    return NextResponse.json(
      { error: "Screening failed: " + String(e) },
      { status: 500 }
    );
  }

  const byFit: Record<string, string[]> = {
    good_fit: [],
    maybe: [],
    irrelevant: [],
  };
  for (const r of results) {
    const fit = r.fit ?? "maybe";
    (byFit[fit] ??= []).push(r.id);
  }

  await Promise.all(
    Object.entries(byFit)
      .filter(([, ids]) => ids.length > 0)
      .map(([fit, ids]) =>
        db.job.updateMany({
          where: { id: { in: ids }, userId: session.user.id },
          data: { relevanceStatus: fit },
        })
      )
  );

  return NextResponse.json({
    screened: results.length,
    good_fit: byFit.good_fit.length,
    maybe: byFit.maybe.length,
    irrelevant: byFit.irrelevant.length,
  });
}
