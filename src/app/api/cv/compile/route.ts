import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { latex } = await req.json();
    const latexServiceUrl = process.env.LATEX_SERVICE_URL ?? "http://localhost:3001";

    const response = await fetch(`${latexServiceUrl}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: 500 });
    }

    const pdfBuffer = await response.arrayBuffer();
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=cv.pdf",
      },
    });
  } catch (e) {
    console.error("[cv/compile]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
