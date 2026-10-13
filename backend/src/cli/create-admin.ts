/* eslint-disable no-console -- commande en ligne : la console est son interface. */
// Doit rester le premier import (voir config/env-file.ts).
import '../config/env-file';
import { PrismaClient } from '@prisma/client';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createAdmin } from './create-admin.core';

/**
 * Commande interactive de création d'un administrateur.
 *   Développement : make create-admin
 *   Production    : voir docs/RUNBOOK.md (docker compose run --rm -it api node dist/cli/create-admin.js)
 * Le mot de passe est saisi sans écho : il n'apparaît ni à l'écran, ni dans l'historique du shell,
 * ni dans les arguments du processus.
 */
class MutableOutput extends Writable {
  muted = false;

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void): void {
    if (!this.muted) process.stdout.write(chunk);
    callback();
  }
}

class InputEndedError extends Error {}

async function main(): Promise<void> {
  const output = new MutableOutput();
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
  // Lecture ligne à ligne : fonctionne au terminal comme avec une entrée redirigée.
  const lines = rl[Symbol.asyncIterator]();

  const readLine = async (): Promise<string> => {
    const next = await lines.next();
    if (next.done) throw new InputEndedError();
    return next.value;
  };
  const ask = (question: string): Promise<string> => {
    process.stdout.write(question);
    return readLine();
  };
  const askHidden = async (question: string): Promise<string> => {
    process.stdout.write(question);
    output.muted = true;
    try {
      return await readLine();
    } finally {
      output.muted = false;
      process.stdout.write('\n');
    }
  };

  console.log('Création d’un compte administrateur — Les Secrets de Diani\n');
  const email = await ask('Adresse e-mail : ');
  const firstName = await ask('Prénom (facultatif) : ');
  const password = await askHidden('Mot de passe (12 caractères minimum) : ');
  const confirmation = await askHidden('Confirmez le mot de passe : ');
  rl.close();

  if (password !== confirmation) {
    console.error('Les mots de passe ne correspondent pas. Aucun compte créé.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const result = await createAdmin(prisma, {
      email,
      password,
      firstName,
      termsVersion: process.env.TERMS_VERSION ?? 'admin',
    });
    if (!result.ok) {
      for (const error of result.errors) console.error(`- ${error}`);
      console.error('Aucun compte créé.');
      process.exitCode = 1;
      return;
    }
    console.log(
      'Administrateur créé. À la première connexion, la double authentification (application TOTP) sera configurée.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Aucun détail technique (l'URL de la base pourrait apparaître dans le message).
  console.error(
    error instanceof InputEndedError
      ? '\nSaisie interrompue. Aucun compte créé.'
      : 'Échec de la création du compte (base de données inaccessible ?).',
  );
  process.exitCode = 1;
});
