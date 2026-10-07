import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useServerFn } from "@tanstack/react-start";
import { getMyUnreadNotificationCount } from "@/lib/notification-engine.functions";

export function NotificationInboxButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const countFn = useServerFn(getMyUnreadNotificationCount);
  const { data } = useQuery({
    queryKey: ["my-unread-notification-count"],
    queryFn: () => countFn(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const count = data?.count ?? 0;
  const label = count > 99 ? "99+" : String(count);

  return (
    <Link
      to="/communications/inbox"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      title={count > 0 ? `${count} unread notifications` : "Notifications"}
      className={
        compact
          ? "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          : "relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {count > 0 && (
        <Badge
          variant="destructive"
          className="absolute -right-1 -top-1 min-w-5 justify-center rounded-full px-1 py-0 text-[10px] leading-5 shadow-sm"
        >
          {label}
        </Badge>
      )}
    </Link>
  );
}
