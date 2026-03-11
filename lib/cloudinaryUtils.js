/**
 * Cloudinary utility functions for image upload
 */

async function getCloudinarySignature(folder) {
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });

  if (!signRes.ok) {
    const errorData = await signRes.json();
    throw new Error(errorData.error || "Failed to get signature");
  }

  return signRes.json();
}

/**
 * Upload a base64 image to Cloudinary
 * @param {string} base64DataUrl - Data URL of the image (e.g., from canvas.toDataURL())
 * @param {string} folder - Cloudinary folder to store the image
 * @returns {Promise<string>} - Returns the Cloudinary secure URL
 */
export async function uploadToCloudinary(base64DataUrl, folder = "tdone-attendance") {
  if (!base64DataUrl) {
    throw new Error("No image data provided");
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    throw new Error("Cloudinary cloud name not configured");
  }

  const formData = new FormData();
  formData.append("file", base64DataUrl);
  formData.append("upload_preset", "unsigned_upload"); // We'll switch to signed if needed
  formData.append("folder", folder);
  formData.append("resource_type", "auto");

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Cloudinary upload failed");
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Upload with server-side signing (more secure, requires backend)
 * Creates optimized thumbnail (300x300, WebP, quality 65%) for audit storage
 * @param {string} base64DataUrl - Data URL of the image
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<string>} - Returns the Cloudinary secure URL with transformations
 */
export async function uploadToCloudinaryWithSignature(base64DataUrl, folder = "tdone-attendance") {
  if (!base64DataUrl) {
    throw new Error("No image data provided");
  }

  try {
    const { signature, timestamp, cloudName, apiKey } = await getCloudinarySignature(folder);

    // Upload with signature + eager transformations for optimization
    const formData = new FormData();
    formData.append("file", base64DataUrl);
    formData.append("folder", folder);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("api_key", apiKey);
    formData.append("resource_type", "auto");
    
    // Eager transformations - create optimized thumbnail during upload
    // 300x300 WebP @ quality 65 for audit + storage efficiency
    const eagerTransform = "w_300,h_300,c_fill,g_face,f_webp,q_65";
    formData.append("eager", eagerTransform);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Cloudinary upload failed");
    }

    const data = await response.json();
    
    // Use the eagerly created thumbnail if available, otherwise use original
    if (data.eager && data.eager.length > 0) {
      return data.eager[0].secure_url;
    }
    
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Upload file attachments to Cloudinary and return the secure URL.
 * This is used for leave/document attachments to avoid storing base64 in DB.
 * @param {File} file - Browser File object
 * @param {string} folder - Cloudinary folder
 * @param {number} maxBytes - Maximum allowed file size in bytes
 * @returns {Promise<string>} - Returns the Cloudinary secure URL
 */
export async function uploadFileToCloudinaryWithSignature(
  file,
  folder = "tdone-attachments",
  maxBytes = 5 * 1024 * 1024,
  allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"]
) {
  if (!file) {
    throw new Error("No file provided");
  }

  if (Number(file.size || 0) > maxBytes) {
    throw new Error(`File too large. Maximum allowed size is ${Math.round(maxBytes / (1024 * 1024))}MB`);
  }

  const fileName = String(file.name || "").toLowerCase();
  const mimeType = String(file.type || "").toLowerCase();
  const hasAllowedMime = allowedMimeTypes.includes(mimeType);
  const hasAllowedExtension = allowedExtensions.some((ext) => fileName.endsWith(ext));

  if (!hasAllowedMime || !hasAllowedExtension) {
    throw new Error("Invalid file type. Allowed: JPG, JPEG, PNG, WEBP, PDF");
  }

  try {
    const { signature, timestamp, cloudName, apiKey } = await getCloudinarySignature(folder);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("api_key", apiKey);
    formData.append("resource_type", "auto");

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Cloudinary upload failed");
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary attachment upload error:", error);
    throw new Error(`Failed to upload attachment: ${error.message}`);
  }
}
