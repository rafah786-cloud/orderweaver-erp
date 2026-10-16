/// <reference lib="webworker" />
import { sha256 } from "@noble/hashes/sha2.js";
// Streams a File off the main thread so hashing 100+ MB sources never freezes the page.
self.onmessage = async (e: MessageEvent<{ file: Blob }>) => {
  try {
    const hash = sha256.create();
    const reader = e.data.file.stream().getReader();
    let done = 0, last = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      hash.update(r.value); done += r.value.byteLength;
      if (done - last > 8 * 1024 * 1024) { last = done; self.postMessage({ progress: done }); }
    }
    self.postMessage({ hex: Array.from(hash.digest(), (b) => b.toString(16).padStart(2, "0")).join("") });
  } catch (err) { self.postMessage({ error: err instanceof Error ? err.message : "Hashing failed." }); }
};
