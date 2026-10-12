import { PermanentMailError } from './mail-transport';
import { ResendTransport } from './resend.transport';

const mail = {
  from: 'Diani <ne-pas-repondre@site.fr>',
  to: 'cliente@example.com',
  subject: 'Objet',
  html: '<p>Bonjour</p>',
  text: 'Bonjour',
  idempotencyKey: 'mail-42',
};

function transport(status: number) {
  const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status }));
  return { fetchMock, transport: new ResendTransport('re_key', fetchMock as typeof fetch) };
}

describe('ResendTransport', () => {
  it('envoie à l’API Resend avec la clé et une clé d’idempotence', async () => {
    const { fetchMock, transport: resend } = transport(200);
    await resend.send(mail);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer re_key',
      'Idempotency-Key': 'mail-42',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: ['cliente@example.com'],
      subject: 'Objet',
      text: 'Bonjour',
    });
  });

  it('erreur définitive sur un refus 4xx (pas de relance)', async () => {
    await expect(transport(422).transport.send(mail)).rejects.toBeInstanceOf(PermanentMailError);
  });

  it.each([429, 500, 503])('erreur temporaire sur %i (relance BullMQ)', async (status) => {
    const error = await transport(status)
      .transport.send(mail)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PermanentMailError);
  });
});
