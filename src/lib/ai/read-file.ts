/**
 * Browser-side document reading. PDFs and plain text are converted to text in
 * the browser so only the extracted text (not the whole file) is sent to the
 * server; photos and scans are sent as an image data URL for vision reading.
 */

export interface ParsedFile {
  text?: string;
  imageDataUrl?: string;
}

const TEXT_TYPES = /^(text\/|application\/(json|xml|csv))/;

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  const max = Math.min(doc.numPages, 25);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  await doc.cleanup();
  return pages.join("\n\n");
}

export async function readDocumentFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const text = await readPdfText(file);
    if (text.trim().length >= 40) return { text };
    // Scanned PDF with no embedded text — fall back to an image of nothing we
    // can render here, so ask the user for a photo instead.
    throw new Error(
      `${file.name} looks like a scanned PDF with no readable text. Upload a photo or image of the pages instead.`,
    );
  }

  if (file.type.startsWith("image/")) {
    return { imageDataUrl: await readAsDataUrl(file) };
  }

  if (TEXT_TYPES.test(file.type) || /\.(txt|csv|xml|json)$/.test(name)) {
    return { text: await readAsText(file) };
  }

  // Unknown type: try text, and give a clear error if it is binary noise.
  const text = await readAsText(file);
  if (!text.trim()) throw new Error(`${file.name} could not be read. Try a PDF, image or text file.`);
  return { text };
}
