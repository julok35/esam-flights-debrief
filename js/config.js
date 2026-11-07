/* Projet Supabase de l'ESAM pour la synchronisation entre appareils (docs/SUPABASE.md). L'adresse et la clé publique
 * (publishable ou anon) ne sont pas secrètes : l'accès aux fiches est protégé par la connexion et par les règles de la
 * base (RLS, liste des membres). Un appareil peut les remplacer dans l'écran Synchronisation. */
export var SUPABASE_URL = 'https://rcwbwokguvnluwuilxoo.supabase.co';
export var SUPABASE_KEY = 'sb_publishable_qhGlwAyyo2r1jVy4adcj_Q_zq2hPNzT';

/* Débit d'enregistrement du drone, en Go par minute de vol, pour les 4 flux enregistrés à chaque vol (Screen, Wide,
 * Thermal, Zoom). Sert à estimer le volume des rushs (F12) à partir de la durée de vol saisie par le pilote.
 * Source : AUCUNE MESURE ENCORE. Valeur provisoire, À CALIBRER selon docs/CALIBRAGE_DEBIT.md (somme des tailles des
 * fichiers d'une carte SD M30T après un vol, divisée par la durée de vol relevée dans Airdata). Une fois mesurée,
 * remplacer la valeur, indiquer ici la date et le vol de référence, et passer DEBIT_A_CALIBRER à false. */
export var DEBIT_GO_PAR_MIN = 1;
// Tant que le débit n'est pas mesuré, l'estimation est signalée comme provisoire dans l'appli et dans la note
export var DEBIT_A_CALIBRER = true;
