import { z } from "zod";

export const credentialsInput = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200, "Password is too long."),
});
