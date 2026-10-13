import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { signBunnyHlsUrl } from '../domain/courses-domain';

export interface Playback {
  /** Playlist HLS signée (hls.js), ou null si la vidéo n'est pas disponible. */
  hlsUrl: string | null;
  expiresAt: Date | null;
}

/** Marge au-delà de la durée de la vidéo (pauses, reprises) ; plafond de 4 heures. */
const MARGIN_SECONDS = 30 * 60;
const MAX_SECONDS = 4 * 3600;

/**
 * Lecture des vidéos Bunny Stream : jamais d'URL permanente. Chaque ouverture de leçon reçoit
 * une URL signée valable le temps de la vidéo + 30 minutes (4 h au plus), éventuellement liée à
 * l'IP de la cliente. Sans configuration Bunny (développement), la leçon n'a pas de vidéo.
 */
@Injectable()
export class VideoService {
  private readonly host: string | undefined;
  private readonly key: string | undefined;
  private readonly bindIp: boolean;

  constructor(config: AppConfigService) {
    this.host = config.get('BUNNY_STREAM_CDN_HOST');
    this.key = config.get('BUNNY_STREAM_TOKEN_KEY');
    this.bindIp = config.get('BUNNY_STREAM_BIND_IP');
  }

  playback(
    videoId: string | null,
    durationSeconds: number | null,
    ip: string,
    now = new Date(),
  ): Playback {
    if (!videoId || !this.host || !this.key) return { hlsUrl: null, expiresAt: null };
    const lifetime = Math.min((durationSeconds ?? 3600) + MARGIN_SECONDS, MAX_SECONDS);
    const expiresAt = new Date(now.getTime() + lifetime * 1000);
    return {
      hlsUrl: signBunnyHlsUrl({
        host: this.host,
        securityKey: this.key,
        videoId,
        expiresAt,
        ...(this.bindIp && ip ? { userIp: ip } : {}),
      }),
      expiresAt,
    };
  }
}
