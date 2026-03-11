import crypto from "crypto";

function getCloudinaryConfig() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary configuration missing");
  }

  return { cloudName, apiKey, apiSecret };
}

export function extractCloudinaryPublicId(secureUrl) {
  if (!secureUrl) return null;
  try {
    const url = new URL(secureUrl);
    const marker = "/upload/";
    const markerIdx = url.pathname.indexOf(marker);
    if (markerIdx < 0) return null;

    let tail = url.pathname.slice(markerIdx + marker.length);
    // Remove potential transformation section(s) and version segment.
    // Example: w_300,h_300,c_fill/v1710000000/folder/file.webp
    const parts = tail.split("/").filter(Boolean);
    const startIdx = parts.findIndex((segment) => /^v\d+$/.test(segment));
    const publicParts = startIdx >= 0 ? parts.slice(startIdx + 1) : parts.slice(-2);
    const withExt = publicParts.join("/");
    const extIdx = withExt.lastIndexOf(".");
    return extIdx > 0 ? withExt.slice(0, extIdx) : withExt;
  } catch {
    return null;
  }
}

async function destroyWithResourceType(publicId, resourceType) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("timestamp", String(timestamp));
  formData.append("api_key", apiKey);
  formData.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Cloudinary destroy failed (${resourceType})`);
  }

  return data;
}

export async function deleteCloudinaryAssetByPublicId(publicId, preferredResourceType = null) {
  if (!publicId) {
    throw new Error("Missing Cloudinary public_id");
  }

  const resourceTypes = preferredResourceType
    ? [preferredResourceType, "image", "raw", "video"]
    : ["image", "raw", "video"];

  let lastError = null;
  for (const resourceType of resourceTypes) {
    try {
      const result = await destroyWithResourceType(publicId, resourceType);
      if (result.result === "ok" || result.result === "not found") {
        return { ok: true, result: result.result, resourceType };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to delete Cloudinary asset");
}
