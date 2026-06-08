import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyInAppNotifications, markInAppRead } from "@/lib/notification-engine.functions";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_app/communications/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyInAppNotifications);
  const markFn = useServerFn(markInAppRead);
  const { data = [], isLoading } = useQuery({
    queryKey: ["in-app-inbox"],
    queryFn: () => listFn(),
  });
  const mark = useMutation({
    mutationFn: (v: { id?: string; all?: boolean }) => markFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["in-app-inbox"] }),
  });

  const unread = data.filter((n: any) => !n.read_at).length;

  return (
    <div>
      <PageHeader title="In-App Inbox" description="Your personal notifications." />
      <PageBody>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" />Notifications {unread > 0 && <Badge>{unread} new</Badge>}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => mark.mutate({ all: true })} disabled={!unread}>
              <Check className="h-4 w-4 mr-1" />Mark all read
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div>
              : data.length === 0 ? <div className="text-sm text-muted-foreground">No notifications yet.</div>
              : (
                <ul className="space-y-2">
                  {data.map((n: any) => (
                    <li key={n.id} className={`p-3 rounded border ${n.read_at ? "opacity-60" : "bg-muted/30"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{n.title}</div>
                          <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            {n.event_key && <> · {n.event_key}</>}
                          </div>
                        </div>
                        {!n.read_at && (
                          <Button size="sm" variant="ghost" onClick={() => mark.mutate({ id: n.id })}>
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )
            }
          </CardContent>
        </Card>
      </PageBody>
    </div>
  );
}
