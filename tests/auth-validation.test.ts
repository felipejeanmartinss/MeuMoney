import { describe, expect, it } from "vitest";
import { registerSchema, updatePasswordSchema } from "../src/utils/auth-validation";

describe("auth validation", () => {
  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse({ fullName: "Felipe Martins", email: "felipe@example.com", password: "Minha frase 123", passwordConfirmation: "Minha frase 123", acceptedTerms: true }).success).toBe(true);
  });

  it("rejects mismatched passwords and missing terms", () => {
    const result = registerSchema.safeParse({ fullName: "Felipe Martins", email: "felipe@example.com", password: "Minha frase 123", passwordConfirmation: "Outra frase 123", acceptedTerms: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors).toMatchObject({ passwordConfirmation: expect.any(Array), acceptedTerms: expect.any(Array) });
  });

  it("requires at least twelve characters for a new password", () => {
    expect(updatePasswordSchema.safeParse({ password: "curta", passwordConfirmation: "curta" }).success).toBe(false);
  });

  it("blocks a small local list of common MVP passwords", () => {
    expect(
      updatePasswordSchema.safeParse({
        password: "senha12345678",
        passwordConfirmation: "senha12345678",
      }).success,
    ).toBe(false);
  });
});
