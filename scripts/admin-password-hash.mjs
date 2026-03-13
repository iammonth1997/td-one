import bcrypt from "bcryptjs";

async function main() {
  const plainPassword = String(process.argv[2] || "").trim();

  if (!plainPassword) {
    console.error("Missing password. Usage: npm run admin:hash -- \"YourStrongPassword123!\"");
    process.exit(1);
  }

  if (plainPassword.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(plainPassword, 10);
  console.log(hash);
}

main().catch((error) => {
  console.error("Failed to generate hash:", error?.message || error);
  process.exit(1);
});
