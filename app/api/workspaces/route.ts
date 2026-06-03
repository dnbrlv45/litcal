import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createWorkspace, getCurrentWorkspace } from "@/lib/workspaces";

export async function POST(request: NextRequest) {
  const currentUser = await requireUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Don't create a second workspace if they already have one
  const { workspace } = await getCurrentWorkspace(currentUser.id);
  if (workspace) return NextResponse.json({ error: "Already in a workspace" }, { status: 409 });

  const body = await request.json() as { name?: string };
  const { workspace: created } = await createWorkspace(currentUser.id, body.name?.trim() ?? "");

  return NextResponse.json({ workspace: created }, { status: 201 });
}
