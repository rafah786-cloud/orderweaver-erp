import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/ai/")({
  beforeLoad: () => {
    throw redirect({ to: "/ai/ask" });
  },
});
