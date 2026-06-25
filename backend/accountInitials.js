/** Derive distinctive 2-letter initials from an email address. */
function initialsFromEmail(email) {
  const local = String(email || '')
    .split('@')[0]
    .replace(/[^a-z0-9]/gi, '');

  if (!local) return 'GO';
  if (local.length === 1) return local.toUpperCase();

  const first = local[0];
  const digits = local.match(/\d+/);
  if (digits?.[0] && digits[0].length >= 2) {
    return `${first}${digits[0][0]}`.toUpperCase();
  }

  const consonantTail = local.slice(1).replace(/[aeiou0-9]/gi, '');
  const second = consonantTail[0] || local[1];
  return `${first}${second}`.toUpperCase();
}

function initialsFromProfile(displayName, email, usedInitials = new Set()) {
  const candidates = [];

  if (email) {
    candidates.push(initialsFromEmail(email));
  }

  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      candidates.push(`${parts[0][0]}${parts[1][0]}`.toUpperCase());
    }
    candidates.push(parts[0].slice(0, 2).toUpperCase());
  }

  for (const candidate of candidates) {
    if (candidate && !usedInitials.has(candidate)) {
      return candidate;
    }
  }

  const fallback = initialsFromEmail(email);
  if (!usedInitials.has(fallback)) {
    return fallback;
  }

  let suffix = 2;
  while (usedInitials.has(`${fallback[0]}${suffix}`)) {
    suffix += 1;
  }
  return `${fallback[0]}${suffix}`;
}

function collectUsedInitials(accountRecords = []) {
  return new Set(
    accountRecords
      .map((record) => record?.initials)
      .filter((value) => typeof value === 'string' && value.trim()),
  );
}

module.exports = {
  initialsFromEmail,
  initialsFromProfile,
  collectUsedInitials,
};
