import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// SECURITY: This endpoint intentionally does not reveal whether an account
// exists or any portion of a registered email address. Unauthenticated email
// enumeration via name+phone has been removed. Users who cannot recall their
// email must contact an administrator.
export const lookupEmailByNamePhone = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(4).max(40),
      })
      .parse(input),
  )
  .handler(async () => {
    return {
      found: false as const,
      message:
        "For your security, registered emails cannot be looked up here. Please contact your administrator to recover your account.",
    };
  });
