import { Metadata } from "next";
import AIInboxClient from "./AIInboxClient";

export const metadata: Metadata = { title: "AI Inbox — LitCal" };

export default function AIInboxPage() {
  return <AIInboxClient />;
}
