import { getEnvValue } from "~/lib/env.server";

export type UploadedRequestAttachment = {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  publicId: string | null;
  resourceType: string | null;
};

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function getProcessEnv(key: string) {
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

function getCloudinaryConfig(context: unknown): CloudinaryConfig {
  const cloudName = getEnvValue(context, "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME") ?? getProcessEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  const apiKey = getEnvValue(context, "CLOUDINARY_API_KEY") ?? getProcessEnv("CLOUDINARY_API_KEY");
  const apiSecret = getEnvValue(context, "CLOUDINARY_API_SECRET") ?? getProcessEnv("CLOUDINARY_API_SECRET");

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary configuration missing");
  }

  return { cloudName, apiKey, apiSecret };
}

async function sha1Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function resolveResourceType(file: File) {
  return file.type === "application/pdf" ? "raw" : "image";
}

async function destroyCloudinaryAsset(publicId: string, resourceType: string, context: unknown) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig(context);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("api_key", apiKey);

  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body: formData,
  }).catch(() => {});
}

export async function uploadRequestAttachment(
  file: File,
  context: unknown,
  folder = "tdone-attachments/requests",
): Promise<UploadedRequestAttachment> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig(context);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);
  const resourceType = resolveResourceType(file);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("api_key", apiKey);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorMessage =
      typeof payload.error === "object" && payload.error !== null && "message" in payload.error
        ? String((payload.error as { message?: unknown }).message || "UPLOAD_FAILED")
        : String(payload.error || "UPLOAD_FAILED");
    throw new Error(errorMessage);
  }

  return {
    fileName: file.name,
    fileUrl: String(payload.secure_url || ""),
    fileSize: file.size,
    mimeType: file.type,
    publicId: payload.public_id ? String(payload.public_id) : null,
    resourceType: payload.resource_type ? String(payload.resource_type) : resourceType,
  };
}

export async function uploadRequestAttachments(files: File[], context: unknown, folder?: string) {
  const uploads: UploadedRequestAttachment[] = [];
  for (const file of files) {
    uploads.push(await uploadRequestAttachment(file, context, folder));
  }
  return uploads;
}

export async function deleteUploadedRequestAttachments(attachments: UploadedRequestAttachment[], context: unknown) {
  for (const attachment of attachments) {
    if (!attachment.publicId) continue;
    await destroyCloudinaryAsset(attachment.publicId, attachment.resourceType || "image", context);
  }
}
