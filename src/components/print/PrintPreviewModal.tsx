import { useRef, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Maximize2, ZoomIn, ZoomOut, Maximize, RotateCcw, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PrintPreviewModalProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

export function PrintPreviewModal({ url, title = "Print Preview", onClose }: PrintPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (url) {
      setLoaded(false);
      setZoom(1);
    }
  }, [url]);

  const computeFitZoom = useCallback(() => {
    const iframe = iframeRef.current;
    const container = containerRef.current;
    if (!iframe || !container || !iframe.contentDocument?.body) return 1;
    const pageWidth = iframe.contentDocument.body.scrollWidth || 794; // ~210mm in px
    const available = container.clientWidth - 32; // padding allowance
    return Math.max(MIN_ZOOM, Math.min(1, available / pageWidth));
  }, []);

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  const handleFitToPage = () => setZoom(computeFitZoom());
  const handleResetZoom = () => setZoom(1);

  const handlePrint = () => {
    const cw = iframeRef.current?.contentWindow;
    if (cw) cw.print();
    else window.open(url ?? undefined, "_blank");
  };

  const handleOpenFull = () => {
    if (url) window.open(url, "_blank");
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[900px] w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-1">
              <Button size="icon" variant="ghost" onClick={handleZoomOut} title="Zoom out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleFitToPage} title="Fit to page">
                <Maximize className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleZoomIn} title="Zoom in">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleResetZoom} title="Reset zoom">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <span className="ml-1 text-xs text-muted-foreground w-10 text-right select-none">{zoomPercent}%</span>
            </div>
            <div className="h-5 w-px bg-border mx-1" />
            <Button size="sm" variant="outline" onClick={handleOpenFull}>
              <Maximize2 className="h-4 w-4 mr-1" /> Open
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div ref={containerRef} className="relative flex-1 bg-muted/30 overflow-auto flex items-start justify-center p-4">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Loading preview…
            </div>
          )}
          {url && (
            <iframe
              ref={iframeRef}
              src={url}
              className="border-0 bg-white shadow"
              style={{
                width: "210mm",
                height: zoom === 1 ? "calc(297mm + 2px)" : "auto",
                minHeight: zoom === 1 ? "auto" : "calc(297mm + 2px)",
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
                marginBottom: zoom > 1 ? `${(zoom - 1) * 297 * 3.78}px` : undefined,
              }}
              onLoad={() => setLoaded(true)}
              title="Print preview"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
