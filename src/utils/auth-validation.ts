import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../domain/currencies";

export const PASSWORD_MIN_LENGTH = 8;
const email = z.email("Informe um e-mail válido.").trim().toLowerCase();
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe sua senha."),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Informe seu nome."),
    email,
    password,
    passwordConfirmation: z.string(),
    acceptedTerms: z
      .boolean()
      .refine((accepted) => accepted, "Aceite os termos para continuar."),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "As senhas não coincidem.",
    path: ["passwordConfirmation"],
  });

export const forgotPasswordSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({ password, passwordConfirmation: z.string() })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "As senhas não coincidem.",
    path: ["passwordConfirmation"],
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome."),
  preferredCurrency: z.enum(SUPPORTED_CURRENCIES, {
    error: "Selecione uma moeda válida.",
  }),
});
