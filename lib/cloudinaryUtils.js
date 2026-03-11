/**
 * Cloudinary utility functions for image upload
 */

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
 * @param {string} base64DataUrl - Data URL of the image
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<string>} - Returns the Cloudinary secure URL
 */
export async function uploadToCloudinaryWithSignature(base64DataUrl, folder = "tdone-attendance") {
  if (!base64DataUrl) {
    throw new Error("No image data provided");
  }

  try {
    // Request signature from backend
    const signRes = await fetch("/api/cloudinary/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });

    if (!signRes.ok) {
      const errorData = await signRes.json();
      throw new Error(errorData.error || "Failed to get signature");
    }

    const { signature, timestamp, cloudName } = await signRes.json();

    // Upload with signature
    const formData = new FormData();
    formData.append("file", base64DataUrl);
    formData.append("folder", folder);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("api_key", process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY);
    formData.append("resource_type", "auto");

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
