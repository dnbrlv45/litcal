import { auth } from "@clerk/nextjs/server";
import { OrganizationProfile, CreateOrganization } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function TeamPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Team & Organization</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your law firm, invite attorneys and staff, and control access.
          </p>
        </div>

        {orgId ? (
          <OrganizationProfile
            appearance={{
              elements: {
                card: "shadow-none border border-border rounded-xl",
                navbar: "hidden",
                pageScrollBox: "p-0",
              },
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border p-5 bg-muted/30">
              <h2 className="font-medium mb-1">Create a Law Firm</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Set up your firm to invite attorneys, paralegals, and assistants. All firm members share a unified calendar.
              </p>
              <CreateOrganization
                afterCreateOrganizationUrl="/"
                appearance={{
                  elements: {
                    card: "shadow-none p-0",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
