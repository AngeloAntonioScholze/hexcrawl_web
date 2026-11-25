/**
 * A typed name as it is shown and kept: control and format characters dropped
 * (zero-width and bidi marks included), compatibility forms folded (NFKC, so
 * fullwidth "Ｍｉｒａ" is "Mira"), then trimmed. Look-alike letters from
 * other scripts stay as they are. Dropping before folding keeps it the same
 * on a name already plain, so guest and host key a name alike.
 */
export const plainName = (name: string): string =>
  name
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .normalize('NFKC')
    .trim()
