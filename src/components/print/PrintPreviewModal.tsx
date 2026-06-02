import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, Maximize2 } from "lucide-react";

interface PrintPreviewModalProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

export function PrintPreviewModal({ url, title = "Print Preview", onClose }: PrintPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (url) setLoaded(false);
  }, [url]);

  const handlePrint = () => {
    const cw = iframeRef.current?.contentWindow;
    if (cw) cw.print();
    else window.open(url ?? undefined, "_blank");
  };

  const handleOpenFull = () => {
    if (url) window.open(url, "_blank");
  };

  return (
    <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[900px] w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
          <div className="flex items-center gap-2">
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
        <div className="relative flex-1 bg-muted/30 overflow-auto">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Loading preview…
            </div>
          )}
          {url && (
            <iframe
              ref={iframeRef}
              src={url}
              className="w-full h-full border-0"
              onLoad={() => setLoaded(true)}
              title="Print preview"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
