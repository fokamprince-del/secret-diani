import { Icon } from '../ui/Icon';
import styles from './PaymentMethods.module.css';

/**
 * Moyens de paiement acceptés, en pastilles. Le paiement se fait chez Stripe (cartes, Apple Pay
 * et Google Pay, selon les moyens activés dans le tableau de bord Stripe) ou chez PayPal : aucune
 * carte ne passe par le site. Logos simplifiés, dessinés en SVG (pas d'image externe).
 */
const METHODES = [
  {
    name: 'Visa',
    logo: (
      <svg viewBox="0 0 48 16">
        <text
          x="24"
          y="13"
          textAnchor="middle"
          fontSize="15"
          fontWeight="800"
          fontStyle="italic"
          fill="#1a1f71"
          fontFamily="Arial, sans-serif"
          letterSpacing="0.5"
        >
          VISA
        </text>
      </svg>
    ),
  },
  {
    name: 'Mastercard',
    logo: (
      <svg viewBox="0 0 40 24">
        <circle cx="15" cy="12" r="9" fill="#eb001b" />
        <circle cx="25" cy="12" r="9" fill="#f79e1b" />
        <path d="M20 4.5a9 9 0 0 1 0 15 9 9 0 0 1 0-15z" fill="#ff5f00" />
      </svg>
    ),
  },
  {
    name: 'Carte bancaire CB',
    logo: (
      <svg viewBox="0 0 40 24">
        <rect x="1" y="2" width="38" height="20" rx="3" fill="#1d5c8f" />
        <path d="M1 22h38V12C30 18 16 21 1 20z" fill="#2c9a5b" />
        <text
          x="20"
          y="16.5"
          textAnchor="middle"
          fontSize="12"
          fontWeight="800"
          fill="#fff"
          fontFamily="Arial, sans-serif"
        >
          CB
        </text>
      </svg>
    ),
  },
  {
    name: 'Apple Pay',
    logo: (
      <svg viewBox="0 0 50 22">
        <path
          d="M11.6 6.2c-.7.8-1.7 1.4-2.7 1.3-.1-1 .4-2.1 1-2.8.7-.8 1.8-1.4 2.7-1.4.1 1.1-.3 2.1-1 2.9zm1 1.6c-1.5-.1-2.8.8-3.5.8s-1.8-.8-3-.8C4.6 7.9 3.2 8.8 2.4 10.2c-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6 0 0-2.4-.9-2.4-3.7 0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8z"
          fill="#000"
          transform="translate(1 -2) scale(0.92)"
        />
        <text
          x="18"
          y="16"
          fontSize="13"
          fontWeight="600"
          fill="#000"
          fontFamily="-apple-system, 'Segoe UI', Arial, sans-serif"
        >
          Pay
        </text>
      </svg>
    ),
  },
  {
    name: 'Google Pay',
    logo: (
      <svg viewBox="0 0 52 22">
        <text x="1" y="16" fontSize="15" fontWeight="700" fontFamily="Arial, sans-serif">
          <tspan fill="#4285f4">G</tspan>
        </text>
        <text
          x="16"
          y="16"
          fontSize="13"
          fontWeight="600"
          fill="#5f6368"
          fontFamily="Arial, sans-serif"
        >
          Pay
        </text>
      </svg>
    ),
  },
  {
    name: 'PayPal',
    logo: (
      <svg viewBox="0 0 60 18">
        <text
          x="30"
          y="14"
          textAnchor="middle"
          fontSize="14"
          fontWeight="800"
          fontStyle="italic"
          fontFamily="Verdana, Arial, sans-serif"
        >
          <tspan fill="#003087">Pay</tspan>
          <tspan fill="#009cde">Pal</tspan>
        </text>
      </svg>
    ),
  },
  {
    name: 'Stripe',
    logo: (
      <svg viewBox="0 0 48 20">
        <text
          x="24"
          y="15"
          textAnchor="middle"
          fontSize="15"
          fontWeight="700"
          fill="#635bff"
          fontFamily="Arial, sans-serif"
          letterSpacing="-0.3"
        >
          stripe
        </text>
      </svg>
    ),
  },
];

export function PaymentMethods() {
  return (
    <div className={styles.paiements}>
      <p className={styles.titre}>
        <Icon name="lock" size={16} />
        Paiement 100 % sécurisé
      </p>
      <ul role="list" className={styles.liste} aria-label="Moyens de paiement acceptés">
        {METHODES.map((methode) => (
          <li key={methode.name} className={styles.pastille} title={methode.name}>
            <span aria-hidden="true">{methode.logo}</span>
            <span className="visually-hidden">{methode.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
