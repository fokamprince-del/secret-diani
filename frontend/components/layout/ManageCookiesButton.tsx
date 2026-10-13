'use client';

import { openConsentManager } from '@/lib/consent';
import styles from './Footer.module.css';

export function ManageCookiesButton() {
  return (
    <button type="button" className={styles.lienBouton} onClick={openConsentManager}>
      Gérer mes cookies
    </button>
  );
}
