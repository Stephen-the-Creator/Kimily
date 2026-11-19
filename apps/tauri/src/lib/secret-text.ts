// Text that looks like a password, an API key, a private key or a card number. The clipboard history in the Dynamic
// Island skips it, so a password copied from a password manager never lands in localStorage.

const KEY_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/, // OpenAI, Anthropic (sk-ant-…), Stripe-style keys
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/, // Stripe
  /\bgh[pousr]_[A-Za-z0-9]{30,}/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/, // GitLab
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/, // Slack
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key
  /\bAIza[0-9A-Za-z_-]{35}\b/, // Google API key
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWT
];

/** Luhn check for a run of 13–19 digits (spaces and dashes allowed), as card numbers have. */
function looksLikeCard(text: string): boolean {
  if (!/^[\d -]{13,23}$/.test(text)) return false;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** One word of 8–128 characters that mixes at least three of: lower case, upper case, digits, symbols. */
function looksLikePassword(text: string): boolean {
  if (text.length < 8 || text.length > 128 || /\s/.test(text)) return false;
  // Addresses, links and file paths are long single words too, but not secrets.
  if (/^(?:https?:\/\/|www\.|[a-zA-Z]:\\|\/)/.test(text) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(text)) return false;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(text)).length;
  return kinds >= 3;
}

export function looksSecret(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  return KEY_PATTERNS.some((r) => r.test(text)) || looksLikeCard(text) || looksLikePassword(text);
}
