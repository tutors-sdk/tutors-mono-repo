declare global {
  namespace App {
    interface Locals {
      actor: { subject: string; login: string; name: string; email: string; image: string | null } | null;
      expiresAt: string | null;
    }
  }
}
export {};
