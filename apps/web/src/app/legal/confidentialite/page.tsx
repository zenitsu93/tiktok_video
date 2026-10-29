export const metadata = { title: "Confidentialité" };

/** Public page asked for by the TikTok developer portal ("Privacy Policy URL"). */
export default function Confidentialite() {
  return (
    <main className="legal">
      <h1>
        Confi<span>dentialité</span>
      </h1>
      <p>La Régie est un outil personnel utilisé par une seule personne, Thomas (@thomasthbdl sur TikTok). Elle ne collecte aucune donnée sur d&apos;autres personnes.</p>
      <h2>Ce qui est gardé</h2>
      <ul>
        <li>Les vidéos de Thomas : scripts, voix, images et exports, sur le serveur de la Régie.</li>
        <li>
          La connexion TikTok de Thomas : l&apos;identifiant de compte (open_id) et les jetons d&apos;accès donnés par TikTok. Les jetons sont chiffrés et ne
          quittent jamais le serveur.
        </li>
      </ul>
      <h2>Ce que la Régie fait avec TikTok</h2>
      <p>
        Elle utilise seulement l&apos;envoi de vidéo dans la boîte de réception (autorisation video.upload) et les informations de base du compte
        (user.info.basic). Elle ne lit ni les vidéos publiées, ni les abonnés, ni les messages, et ne publie rien seule.
      </p>
      <h2>Partage et suppression</h2>
      <p>Rien n&apos;est vendu ni partagé. Supprimer une vidéo dans la Régie efface ses fichiers. La connexion TikTok peut être retirée à tout moment depuis les réglages de TikTok, et les jetons cessent alors de fonctionner.</p>
      <p className="mute">Dernière mise à jour : 29 octobre 2026.</p>
    </main>
  );
}
