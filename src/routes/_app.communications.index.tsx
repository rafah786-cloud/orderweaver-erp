import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/communications/")({
  beforeLoad: () => {
    throw redirect({ to: "/communications/events" });
  },
});
