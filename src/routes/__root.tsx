import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";

import appCss from "../styles.css?url";
import corporateCss from "../corporate.css?url";

function NotFoundComponent() {
  return (
    <div className="min-h-screen bg-[#f7f7f4] px-4 py-10 text-[#17324d]">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-2xl border border-[#dbe3e8] bg-white p-8 text-center shadow-[0_24px_60px_-32px_rgba(15,34,53,.35)] sm:p-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#17324d] text-sm font-bold text-white">
            Z
          </div>
          <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">
            House of Abood Tradings
          </div>
          <h1 className="mt-3 text-6xl font-semibold tracking-[-0.04em]">404</h1>
          <h2 className="mt-2 text-xl font-semibold">Page not found</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6b7788]">
            The page you requested does not exist or may have moved.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-[#17324d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#11283e]"
            >
              Return to website
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-md border border-[#cfd8e2] bg-white px-4 py-2.5 text-sm font-semibold text-[#243a50] hover:bg-[#f3f6f8]"
            >
              Portal login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#f7f7f4] px-4 py-10 text-[#17324d]">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-2xl border border-[#dbe3e8] bg-white p-8 text-center shadow-[0_24px_60px_-32px_rgba(15,34,53,.35)] sm:p-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#17324d] text-sm font-bold text-white">
            Z
          </div>
          <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">
            Mattress Maestro
          </div>
          <h1 className="mt-3 text-2xl font-semibold">Something went wrong</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6b7788]">
            An unexpected error occurred. Your saved business data has not been intentionally changed by this screen.
          </p>
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="mt-7 inline-flex items-center justify-center rounded-md bg-[#17324d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#11283e]"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Zizz Mattress | House of Abood Tradings" },
      {
        name: "description",
        content: "Premium sleep and comfort solutions from House of Abood Tradings, led by Zizz.",
      },
      { property: "og:title", content: "Zizz Mattress | House of Abood Tradings" },
      { name: "twitter:title", content: "Zizz Mattress | House of Abood Tradings" },
      {
        property: "og:description",
        content: "Premium sleep and comfort solutions from House of Abood Tradings, led by Zizz.",
      },
      {
        name: "twitter:description",
        content: "Premium sleep and comfort solutions from House of Abood Tradings, led by Zizz.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/Lw0gR7977khvbGCmnXKoutSkshF3/social-images/social-1780066816611-D6A5E0FA-94F0-45E9-970A-B975B866769E.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/Lw0gR7977khvbGCmnXKoutSkshF3/social-images/social-1780066816611-D6A5E0FA-94F0-45E9-970A-B975B866769E.webp",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: corporateCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/zizz-logo-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Work+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
