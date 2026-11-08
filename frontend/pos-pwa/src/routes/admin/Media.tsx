import { PageHeader } from "../../components/ui";
import { MediaLibrary } from "../../components/MediaLibrary";

export default function Media() {
  return (
    <>
      <PageHeader
        title="Médiathèque"
        subtitle="Images stockées sur le serveur (MinIO) : logo, fond de connexion, visuels des billets. Choisissez-les ensuite dans Paramètres et Billetterie."
      />
      <div className="card p-5">
        <MediaLibrary mode="manage" />
      </div>
    </>
  );
}
