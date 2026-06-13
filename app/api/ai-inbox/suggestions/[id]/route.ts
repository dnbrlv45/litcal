import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspaces";
import { Prisma } from "@prisma/client";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await getCurrentWorkspace(user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { id } = await params;

  const suggestion = await prisma.aISuggestion.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json() as { action: string; extractedData?: Record<string, unknown> };
  const { action, extractedData } = body;


  if (action === "ignore") {
    const updated = await prisma.aISuggestion.update({
      where: { id },
      data: { status: "IGNORED" },
    });
    return NextResponse.json({ suggestion: updated });
  }

  if (action === "approve" || action === "create_anyway") {
    const data = (extractedData ?? suggestion.extractedData) as {
      case?: Record<string, string | null>;
      event?: Record<string, string | null>;
      discovery?: Record<string, string | null>;
      discoveryExtension?: Record<string, string | null>;
    };
    const classification = suggestion.classification;

    if (classification === "CALENDAR_EVENT") {
      const event    = data.event;
      const caseData = data.case ?? {};

      if (!event?.date) {
        return NextResponse.json({ error: "Missing event date in extracted data" }, { status: 400 });
      }

      const startTime = event.startTime
        ? new Date(`${event.date}T${event.startTime}`)
        : new Date(`${event.date}T09:00:00`);
      const endTime = event.endTime
        ? new Date(`${event.date}T${event.endTime}`)
        : new Date(startTime.getTime() + 60 * 60 * 1000);

      // Find or create the case so the event can be linked to it
      let caseId: string | undefined;
      if (caseData.caseNumber || caseData.plaintiff || caseData.defendant) {
        let matchingCase = await prisma.case.findFirst({
          where: {
            workspaceId: workspace.id,
            ...(caseData.caseNumber ? { caseNumber: caseData.caseNumber } : {}),
          },
        });

        if (!matchingCase) {
          matchingCase = await prisma.case.create({
            data: {
              userId:          user.id,
              workspaceId:     workspace.id,
              title:           [caseData.plaintiff, "v.", caseData.defendant].filter(Boolean).join(" ") || "New Case",
              caseNumber:      caseData.caseNumber ?? undefined,
              county:          caseData.county ?? undefined,
              court:           caseData.court ?? undefined,
              defenseFirm:     caseData.defenseFirm ?? undefined,
              defenseAttorney: caseData.defenseAttorney ?? undefined,
              filingDate:      caseData.dateFiled ? new Date(caseData.dateFiled) : undefined,
              status:          "ACTIVE",
              parties: {
                create: [
                  ...(caseData.plaintiff ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
                  ...(caseData.defendant ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
                ],
              },
            },
          });
        } else {
          // Fill in any fields that are missing on the existing case
          const updates: Record<string, unknown> = {};
          if (!matchingCase.county      && caseData.county)      updates.county      = caseData.county;
          if (!matchingCase.court       && caseData.court)       updates.court       = caseData.court;
          if (!matchingCase.defenseFirm && caseData.defenseFirm) updates.defenseFirm = caseData.defenseFirm;
          if (!matchingCase.defenseAttorney && caseData.defenseAttorney) updates.defenseAttorney = caseData.defenseAttorney;
          if (!matchingCase.filingDate  && caseData.dateFiled)   updates.filingDate  = new Date(caseData.dateFiled);

          if (Object.keys(updates).length > 0) {
            await prisma.case.update({ where: { id: matchingCase.id }, data: updates });
          }

          // Add plaintiff/defendant parties if not already present
          const existingParties = await prisma.caseParty.findMany({
            where: { caseId: matchingCase.id },
            select: { role: true },
          });
          const existingRoles = new Set(existingParties.map((p) => p.role));
          const newParties = [
            ...(caseData.plaintiff && !existingRoles.has("PLAINTIFF") ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
            ...(caseData.defendant && !existingRoles.has("DEFENDANT") ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
          ];
          if (newParties.length > 0) {
            await prisma.caseParty.createMany({
              data: newParties.map((p) => ({ ...p, caseId: matchingCase!.id })),
            });
          }
        }

        caseId = matchingCase.id;
      }

      // Skip if a matching event already exists (same case, date, and event type)
      const duplicateEvent = caseId
        ? await prisma.event.findFirst({
            where: {
              workspaceId: workspace.id,
              caseId,
              startTime,
              eventType: mapEventType(event.eventType),
            },
          })
        : null;

      if (!duplicateEvent) {
        await prisma.event.create({
          data: {
            userId:      user.id,
            workspaceId: workspace.id,
            caseId,
            title:       event.title ?? suggestion.subject ?? "AI Inbox Event",
            description: event.description ?? undefined,
            startTime,
            endTime,
            location:    event.location ?? undefined,
            eventType:   mapEventType(event.eventType),
            status:      "SCHEDULED",
          },
        });
      }
    }

    if (classification === "DISCOVERY") {
      const disc = data.discovery ?? {};
      const caseData = data.case ?? {};

      let matchingCase = await prisma.case.findFirst({
        where: {
          workspaceId: workspace.id,
          ...(caseData.caseNumber ? { caseNumber: caseData.caseNumber } : {}),
        },
      });

      if (!matchingCase) {
        matchingCase = await prisma.case.create({
          data: {
            userId:          user.id,
            workspaceId:     workspace.id,
            title:           [caseData.plaintiff, "v.", caseData.defendant].filter(Boolean).join(" ") || "New Case",
            caseNumber:      caseData.caseNumber ?? undefined,
            county:          caseData.county ?? undefined,
            court:           caseData.court ?? undefined,
            defenseFirm:     caseData.defenseFirm ?? undefined,
            defenseAttorney: caseData.defenseAttorney ?? undefined,
            filingDate:      caseData.dateFiled ? new Date(caseData.dateFiled) : undefined,
            status:          "ACTIVE",
            parties: {
              create: [
                ...(caseData.plaintiff ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
                ...(caseData.defendant ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
              ],
            },
          },
        });
      }

      const servedDate = disc.servedOrReceivedDate ? new Date(disc.servedOrReceivedDate) : new Date();
      const dueDate = disc.responseDueDate
        ? new Date(disc.responseDueDate)
        : new Date(servedDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      const direction = disc.direction === "SERVED" ? "SERVED" : "RECEIVED";
      const discoveryType = mapDiscoveryType(disc.discoveryType);

      await prisma.discoveryItem.create({
        data: {
          caseId:              matchingCase.id,
          workspaceId:         workspace.id,
          createdBy:           user.id,
          discoveryType,
          direction,
          servedOrReceivedDate: servedDate,
          originalDueDate:      dueDate,
          currentDueDate:       dueDate,
          status:               "AWAITING_RESPONSE",
        },
      });
    }

    if (classification === "DISCOVERY_EXTENSION") {
      const ext = data.discoveryExtension ?? {};
      const caseData = data.case ?? {};
      if (ext.newDate) {
        const matchingCase = await prisma.case.findFirst({
          where: {
            workspaceId: workspace.id,
            ...(caseData.caseNumber ? { caseNumber: caseData.caseNumber } : {}),
          },
        });
        if (!matchingCase) {
          return NextResponse.json({
            error: "No matching case found in LitCal. Create the case first.",
          }, { status: 422 });
        }
        const discoveryItem = await prisma.discoveryItem.findFirst({
          where: { caseId: matchingCase.id, status: { notIn: ["COMPLETED"] } },
          orderBy: { updatedAt: "desc" },
        });
        if (!discoveryItem) {
          return NextResponse.json({
            error: "No active discovery item found for this case. No changes made.",
          }, { status: 422 });
        }
        const newDue = new Date(ext.newDate);
        const extCount = await prisma.discoveryExtension.count({
          where: { discoveryItemId: discoveryItem.id },
        });
        await prisma.discoveryExtension.create({
          data: {
            discoveryItemId: discoveryItem.id,
            extensionNumber: extCount + 1,
            grantedDate:     new Date(),
            previousDueDate: discoveryItem.currentDueDate,
            newDueDate:      newDue,
            appliesTo:       "OUR_DEADLINE",
            createdBy:       user.id,
          },
        });
        await prisma.discoveryItem.update({
          where: { id: discoveryItem.id },
          data: { currentDueDate: newDue, status: "EXTENSION_GRANTED" },
        });
      }
    }

    if (classification === "NEW_CASE") {
      const caseData = data.case ?? {};
      await prisma.case.create({
        data: {
          userId:          user.id,
          workspaceId:     workspace.id,
          title:           [caseData.plaintiff, "v.", caseData.defendant].filter(Boolean).join(" ") || "New Case",
          caseNumber:      caseData.caseNumber ?? undefined,
          county:          caseData.county ?? undefined,
          court:           caseData.court ?? undefined,
          defenseFirm:     caseData.defenseFirm ?? undefined,
          defenseAttorney: caseData.defenseAttorney ?? undefined,
          filingDate:      caseData.dateFiled ? new Date(caseData.dateFiled) : undefined,
          status:          "ACTIVE",
          parties: {
            create: [
              ...(caseData.plaintiff ? [{ name: caseData.plaintiff, role: "PLAINTIFF" as const }] : []),
              ...(caseData.defendant ? [{ name: caseData.defendant, role: "DEFENDANT" as const }] : []),
            ],
          },
        },
      });
    }

    const updated = await prisma.aISuggestion.update({
      where: { id },
      data: {
        status:        "APPROVED",
        extractedData: (extractedData ?? suggestion.extractedData) as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ suggestion: updated });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

function mapDiscoveryType(raw: string | null | undefined): "FORM_INTERROGATORIES" | "SPECIAL_INTERROGATORIES" | "REQUESTS_FOR_PRODUCTION" | "REQUESTS_FOR_ADMISSION" | "DEPOSITION_NOTICE" | "OTHER" {
  if (!raw) return "OTHER";
  const t = raw.toUpperCase();
  if (t.includes("FORM_INTERROG") || (t.includes("FORM") && t.includes("INTERROG"))) return "FORM_INTERROGATORIES";
  if (t.includes("SPECIAL_INTERROG") || (t.includes("SPECIAL") && t.includes("INTERROG"))) return "SPECIAL_INTERROGATORIES";
  if (t.includes("PRODUCTION") || t.includes("RFP")) return "REQUESTS_FOR_PRODUCTION";
  if (t.includes("ADMISSION") || t.includes("RFA")) return "REQUESTS_FOR_ADMISSION";
  if (t.includes("DEPOSITION_NOTICE") || t.includes("DEPO")) return "DEPOSITION_NOTICE";
  return "OTHER";
}

function mapEventType(raw: string | null | undefined): "HEARING" | "DEPOSITION" | "TRIAL" | "CONFERENCE" | "MEDIATION" | "DEADLINE" | "OTHER" {
  if (!raw) return "OTHER";
  const t = raw.toUpperCase();
  if (t.includes("HEAR"))  return "HEARING";
  if (t.includes("DEPO"))  return "DEPOSITION";
  if (t.includes("TRIAL")) return "TRIAL";
  if (t.includes("CONF") || t.includes("CMC") || t.includes("MSC")) return "CONFERENCE";
  if (t.includes("MEDI"))  return "MEDIATION";
  if (t.includes("DEAD") || t.includes("EXTENSION")) return "DEADLINE";
  return "OTHER";
}
