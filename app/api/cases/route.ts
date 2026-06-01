import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function ensureUser(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  return prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email, firstName: clerkUser.firstName ?? null, lastName: clerkUser.lastName ?? null },
    update: {},
  });
}

// GET /api/cases
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cases = await prisma.case.findMany({
    where: orgId ? { orgId } : { userId, orgId: null },
    include: {
      parties: true,
      _count: { select: { events: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ cases });
}

// POST /api/cases
export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    title: string;
    caseNumber?: string;
    caseType?: string;
    court?: string;
    judge?: string;
    jurisdiction?: string;
    description?: string;
    filingDate?: string;
  };

  if (!body.title?.trim())
    return NextResponse.json({ error: "Title is required" }, { status: 400 });

  await ensureUser(userId);

  const validTypes = ["CIVIL","CRIMINAL","FAMILY","BANKRUPTCY","IMMIGRATION","ADMINISTRATIVE","OTHER"];
  const caseType = validTypes.includes(body.caseType ?? "") ? body.caseType as never : "CIVIL";

  const newCase = await prisma.case.create({
    data: {
      userId,
      orgId: orgId ?? null,
      title: body.title.trim(),
      caseNumber: body.caseNumber?.trim() || null,
      caseType,
      court: body.court?.trim() || null,
      judge: body.judge?.trim() || null,
      jurisdiction: body.jurisdiction?.trim() || null,
      description: body.description?.trim() || null,
      filingDate: body.filingDate ? new Date(body.filingDate) : null,
    },
    include: { parties: true, _count: { select: { events: true } } },
  });

  return NextResponse.json({ case: newCase }, { status: 201 });
}
