"use client";

import { HandleSSOCallback } from "@clerk/nextjs";

export default function SSOCallbackPage() {
  return (
    <HandleSSOCallback
      navigateToApp={({ session, decorateUrl }) => {
        const destination = session?.currentTask ? `/sign-in/tasks/${session.currentTask.key}` : "/";
        const url = decorateUrl(destination);
        window.location.href = url;
      }}
      navigateToSignIn={() => {
        window.location.href = "/sign-in";
      }}
      navigateToSignUp={() => {
        window.location.href = "/sign-up";
      }}
    />
  );
}
