export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email is required" };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }
  if (email.length > 255) {
    return { valid: false, error: "Email exceeds maximum length" };
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required" };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return {
      valid: false,
      error: "Password must be at least 8 characters and contain at least one letter and one number",
    };
  }
  return { valid: true };
}

export function validateName(name: string | undefined): { valid: boolean; error?: string } {
  if (name === undefined || name === null) return { valid: true };
  if (typeof name !== "string") return { valid: false, error: "Name must be a string" };
  if (name.length > 100) return { valid: false, error: "Name exceeds maximum length" };
  if (name.trim().length === 0) return { valid: false, error: "Name cannot be blank" };
  return { valid: true };
}

export function validateRegisterInput(input: RegisterInput): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const emailCheck = validateEmail(input.email);
  if (!emailCheck.valid) errors.email = emailCheck.error!;
  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.valid) errors.password = passwordCheck.error!;
  const firstNameCheck = validateName(input.firstName);
  if (!firstNameCheck.valid) errors.firstName = firstNameCheck.error!;
  const lastNameCheck = validateName(input.lastName);
  if (!lastNameCheck.valid) errors.lastName = lastNameCheck.error!;
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateLoginInput(input: LoginInput): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const emailCheck = validateEmail(input.email);
  if (!emailCheck.valid) errors.email = emailCheck.error!;
  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.valid) errors.password = passwordCheck.error!;
  return { valid: Object.keys(errors).length === 0, errors };
}
