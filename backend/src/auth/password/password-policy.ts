import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordContext {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

let commonPasswords: Set<string> | undefined;

/**
 * Mots de passe les plus courants de 12 caractères ou plus (≈ 46 000 entrées issues de fuites
 * publiques, liste SecLists « xato-net 1M », en minuscules). Chargée une seule fois, à la demande.
 */
function getCommonPasswords(): Set<string> {
  commonPasswords ??= new Set(
    gunzipSync(readFileSync(join(__dirname, 'common-passwords.txt.gz')))
      .toString('utf8')
      .split('\n')
      .filter((line) => line.length > 0),
  );
  return commonPasswords;
}

function isRepetitiveOrSequential(password: string): boolean {
  if (/^(.)\1+$/.test(password)) return true;
  const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'azertyuiop', 'qwertyuiop'];
  const lower = password.toLowerCase();
  return sequences.some((sequence) => (sequence + sequence).includes(lower));
}

/** Fragments personnels interdits dans le mot de passe (partie locale de l'e-mail, prénom, nom). */
function personalFragments(context: PasswordContext): string[] {
  const local = context.email?.split('@')[0] ?? '';
  return [local, context.firstName ?? '', context.lastName ?? '']
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 4);
}

/**
 * Politique de mot de passe (OWASP ASVS 2.1) : longueur 12 à 128, aucune règle de composition
 * imposée, refus des mots de passe courants, triviaux ou construits sur des informations personnelles.
 * Retourne la liste des problèmes (vide si le mot de passe est accepté).
 */
export function checkPasswordPolicy(password: string, context: PasswordContext = {}): string[] {
  const problems: string[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    problems.push(`doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`);
  }
  if (length > PASSWORD_MAX_LENGTH) {
    problems.push(`doit contenir au plus ${PASSWORD_MAX_LENGTH} caractères`);
  }
  if (problems.length > 0) return problems;

  const lower = password.toLowerCase();
  if (getCommonPasswords().has(lower) || isRepetitiveOrSequential(password)) {
    problems.push('est trop courant ou trop facile à deviner');
  }
  if (personalFragments(context).some((fragment) => lower.includes(fragment))) {
    problems.push('ne doit pas contenir votre nom ou votre adresse e-mail');
  }
  return problems;
}
