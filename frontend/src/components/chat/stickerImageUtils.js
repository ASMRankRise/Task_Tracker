const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB source file
const MAX_OUTPUT_BYTES = 195 * 1024; // Stay safely under 200 KB backend cap
const ALLOWED_INPUT_TYPES = new Set([
  "image/png",
  "image/webp",
  "image/jpeg",
  "image/gif",
]);

export function deriveLabelFromFilename(filename = "") {
  const base = String(filename)
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "Custom Sticker";
  return base.slice(0, 40);
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image file"));
    };
    img.src = objectUrl;
  });

const estimateBase64Bytes = (dataUrl) => {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return 0;
  const b64 = dataUrl.slice(commaIdx + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
};

const renderToStickerCanvas = (img, canvasSize, addWhiteBorder) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser");

  const pad = addWhiteBorder ? Math.round(canvasSize * 0.08) : Math.round(canvasSize * 0.03);
  const maxDim = canvasSize - pad * 2;
  const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
  const drawW = Math.max(1, Math.round(img.naturalWidth * scale));
  const drawH = Math.max(1, Math.round(img.naturalHeight * scale));
  const dx = Math.round((canvasSize - drawW) / 2);
  const dy = Math.round((canvasSize - drawH) / 2);

  if (addWhiteBorder) {
    // Build a solid white silhouette of the image on an offscreen canvas
    const silCanvas = document.createElement("canvas");
    silCanvas.width = canvasSize;
    silCanvas.height = canvasSize;
    const sctx = silCanvas.getContext("2d");
    sctx.drawImage(img, dx, dy, drawW, drawH);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = "#FFFFFF";
    sctx.fillRect(0, 0, canvasSize, canvasSize);

    // Stamp silhouette radially to form a crisp die-cut sticker outline
    const radius = Math.max(6, Math.round(canvasSize * 0.025));
    const steps = 24;
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
    ctx.shadowBlur = Math.round(canvasSize * 0.025);
    ctx.shadowOffsetY = Math.round(canvasSize * 0.012);
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      ctx.drawImage(
        silCanvas,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    }
    ctx.restore();

    // Crisp pass without shadow accumulation
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      ctx.drawImage(
        silCanvas,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    }
  }

  ctx.drawImage(img, dx, dy, drawW, drawH);
  return canvas;
};

/**
 * Optimizes an uploaded image into a WhatsApp-style 512x512 transparent WebP
 * (or preserves small animated GIFs <= 195 KB when white border is off).
 */
export async function processStickerFile(file, { addWhiteBorder = false } = {}) {
  if (!file) throw new Error("Please choose an image file");

  if (!ALLOWED_INPUT_TYPES.has(file.type)) {
    throw new Error("Supported formats: PNG, WebP, JPG, or GIF");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Source image must be under 5 MB");
  }

  const suggestedLabel = deriveLabelFromFilename(file.name);

  // Preserve animated GIFs directly if already compact and no border requested
  if (file.type === "image/gif" && file.size <= MAX_OUTPUT_BYTES && !addWhiteBorder) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl,
      sizeBytes: estimateBase64Bytes(dataUrl),
      mimeType: "image/gif",
      suggestedLabel,
    };
  }

  const img = await loadImageFromFile(file);
  const sizes = [512, 384, 256];
  const qualities = [0.88, 0.78, 0.68, 0.56];

  for (const size of sizes) {
    const canvas = renderToStickerCanvas(img, size, addWhiteBorder);

    for (const q of qualities) {
      const webpUrl = canvas.toDataURL("image/webp", q);
      if (webpUrl.startsWith("data:image/webp;base64,")) {
        const bytes = estimateBase64Bytes(webpUrl);
        if (bytes > 0 && bytes <= MAX_OUTPUT_BYTES) {
          return {
            dataUrl: webpUrl,
            sizeBytes: bytes,
            mimeType: "image/webp",
            suggestedLabel,
          };
        }
      }
    }

    // Fallback to PNG if browser doesn't support WebP canvas export
    const pngUrl = canvas.toDataURL("image/png");
    const pngBytes = estimateBase64Bytes(pngUrl);
    if (pngBytes > 0 && pngBytes <= MAX_OUTPUT_BYTES) {
      return {
        dataUrl: pngUrl,
        sizeBytes: pngBytes,
        mimeType: "image/png",
        suggestedLabel,
      };
    }
  }

  throw new Error(
    "Image is too detailed to compress under 200 KB. Try a simpler image or smaller file.",
  );
}
