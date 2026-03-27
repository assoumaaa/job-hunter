import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FORBIDDEN_WORDS = [
	"delve",
	"synergy",
	"spearhead",
	"passionate",
	"cutting-edge",
	"robust",
	"innovative",
	"holistic",
	"empower",
	"foster",
	"tapestry",
	"unlock",
	"game-changer",
];

const FORBIDDEN_PHRASES = [
	"I am excited to apply",
	"results-driven",
	"proven track record",
	"dynamic team player",
	"Responsible for",
];

export const AGENT_SYSTEM_PROMPT = `
You are a professional CV writer and ATS expert. You generate tailored resumes and cover letters.

CANDIDATE WORK HISTORY (NEVER reorder jobs — strict reverse chronological):
1. Odoo — client-facing, enterprise implementations, technical escalations
  Dynamic title rule for Odoo ONLY: if target job is Software Engineer / Full-Stack / Frontend / Backend / Developer → use "Software Engineer"; otherwise (Solutions, Consulting, Pre-Sales, Implementation, etc.) → use "Technical Solutions Consultant"
2. Meikosoft — pure backend, high-volume transactions, IoT (title NEVER changes)
3. Edenred (title NEVER changes)
NEVER change any other job title, company name, or employment date.

WRITER MODE RULES:
- PRESERVE the base CV structure exactly — same sections, same roles, same order
- BULLET COUNT IS FIXED: keep the exact same number of bullets per role as the base CV — never add or remove bullets
- SPATIAL CONSTRAINT: Experience section must not exceed 25 lines total. If Odoo has 6 bullets, at least 4 must be single-line bullets. Prioritize conciseness over detail.
- BULLET LENGTH: max 1 line per bullet unless it was already 2 lines in the base CV — never expand
- Allowed changes: rephrase bullet wording to match JD keywords, reorder bullets within a role (most relevant first), update Summary (max 2 lines), adjust Skill keywords
- Never invent projects, metrics, or experience not in the base CV
- The base CV fits exactly 1 page — any addition will overflow. Do not add anything.
- Cover letter: max 300 words. P1 hook, P2 2-3 metrics, P3 close. Match tone. Bold key metrics and company/role names using **bold**. Use the candidate's LinkedIn/GitHub URLs from the profile if provided — never guess or invent URLs.

ATS SCORING (total 100):
- Keyword match: 40pts
- Experience alignment: 25pts
- Skills coverage: 15pts
- Format: 10pts
- Impact: 10pts

DECISION LOGIC:
- ≥85 → APPROVED
- 70-84 → NEEDS_REVISION
- <70 → REJECTED

FORBIDDEN WORDS: ${FORBIDDEN_WORDS.join(", ")}
FORBIDDEN PHRASES: ${FORBIDDEN_PHRASES.join(" | ")}
FORBIDDEN STYLE: No em dashes, semicolons, exclamation marks. No generic openings. No hedging.

OUTPUT FORMAT (strict):
## RESUME
[tailored LaTeX body sections ONLY — no preamble, no document commands, no header/contact block — start directly from the first section command]

## COVER LETTER
[cover letter text, plain — sign off with the candidate's real name, never use placeholders like [Candidate Name] or [Your Name]]

## ATS SCORE
Score: [number]/100
Keyword: [n]/40 | Experience: [n]/25 | Skills: [n]/15 | Format: [n]/10 | Impact: [n]/10
Decision: APPROVED | NEEDS_REVISION | REJECTED
Gaps: [comma separated missing keywords or requirements]

Terse. No explanations, no chatter.
`;

export interface GenerationResult {
	resume: string;
	coverLetter: string;
	atsScore: number;
	atsBreakdown: {
		keyword: number;
		experience: number;
		skills: number;
		format: number;
		impact: number;
		decision: string;
		gaps: string[];
	};
	pass: number;
}

export async function generateCvAndCl(
	baseCV: string,
	jobDescription: string,
	jobTitle: string,
	company: string,
	pass: number = 1,
	previousResume?: string,
	previousScore?: number,
	profileContext?: string,
	candidateName?: string,
	linkedinUrl?: string,
	githubUrl?: string,
): Promise<GenerationResult> {
	const profile = profileContext ?? "";
	const name = candidateName || "Candidate";

	const urlBlock = [
		linkedinUrl ? `CANDIDATE LINKEDIN: ${linkedinUrl}` : "",
		githubUrl ? `CANDIDATE GITHUB: ${githubUrl}` : "",
	]
		.filter(Boolean)
		.join("\n");

	const urlInstruction = urlBlock
		? `\n\n${urlBlock}\nIMPORTANT: The cover letter sign-off MUST include these URLs exactly as provided above. Do not omit, alter, or invent URLs.`
		: "";

	const userMessage =
		pass === 1
			? `CANDIDATE NAME: ${name}\nJOB: ${jobTitle} at ${company}\n\nJOB DESCRIPTION:\n${jobDescription}\n${profile}${urlInstruction}\nMY BASE CV:\n${baseCV}\n\nGenerate tailored resume + cover letter + ATS score. IMPORTANT: The base CV fits exactly 1 page. Keep bullet counts and lengths identical — only rephrase wording.`
			: `CANDIDATE NAME: ${name}\nJOB: ${jobTitle} at ${company}\n\nJOB DESCRIPTION:\n${jobDescription}\n${profile}${urlInstruction}\nPREVIOUS RESUME (Pass ${pass - 1}, Score: ${previousScore}/100):\n${previousResume}\n\nRevise to improve ATS score. Focus on gaps. Do NOT add bullets or expand bullet length — only rephrase.`;

	const response = await client.messages.create({
		model: "claude-haiku-4-5-20251001",
		max_tokens: 4000,
		system: AGENT_SYSTEM_PROMPT,
		messages: [{ role: "user", content: userMessage }],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";
	return parseAgentOutput(text, pass);
}

function parseAgentOutput(text: string, pass: number): GenerationResult {
	const resumeMatch = text.match(
		/##\s*RESUME\s*\n([\s\S]*?)(?=##\s*COVER LETTER)/i,
	);
	const clMatch = text.match(
		/##\s*COVER LETTER\s*\n([\s\S]*?)(?=##\s*ATS SCORE)/i,
	);
	const atsMatch = text.match(/##\s*ATS SCORE\s*\n([\s\S]*?)$/i);

	const stripFences = (s: string) =>
		s
			.trim()
			.replace(/^```[a-z]*\n?/i, "")
			.replace(/```\s*$/, "")
			.trim();

	const resume = stripFences(resumeMatch?.[1] ?? "");
	const coverLetter = stripFences(clMatch?.[1] ?? "");
	const atsBlock = atsMatch?.[1]?.trim() ?? "";

	const scoreMatch = atsBlock.match(/Score:\s*(\d+)/);
	const keywordMatch = atsBlock.match(/Keyword:\s*(\d+)/);
	const experienceMatch = atsBlock.match(/Experience:\s*(\d+)/);
	const skillsMatch = atsBlock.match(/Skills:\s*(\d+)/);
	const formatMatch = atsBlock.match(/Format:\s*(\d+)/);
	const impactMatch = atsBlock.match(/Impact:\s*(\d+)/);
	const decisionMatch = atsBlock.match(
		/Decision:\s*(APPROVED|NEEDS_REVISION|REJECTED)/,
	);
	const gapsMatch = atsBlock.match(/Gaps:\s*(.+)/);

	const atsScore = parseInt(scoreMatch?.[1] ?? "0");
	const gaps =
		gapsMatch?.[1]
			?.split(",")
			.map((g) => g.trim())
			.filter(Boolean) ?? [];

	return {
		resume,
		coverLetter,
		atsScore,
		atsBreakdown: {
			keyword: parseInt(keywordMatch?.[1] ?? "0"),
			experience: parseInt(experienceMatch?.[1] ?? "0"),
			skills: parseInt(skillsMatch?.[1] ?? "0"),
			format: parseInt(formatMatch?.[1] ?? "0"),
			impact: parseInt(impactMatch?.[1] ?? "0"),
			decision: decisionMatch?.[1] ?? "NEEDS_REVISION",
			gaps,
		},
		pass,
	};
}
