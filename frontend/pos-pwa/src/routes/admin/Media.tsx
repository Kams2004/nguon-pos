import { PageHeader } from "../../components/ui";
import { MediaLibrary } from "../../components/MediaLibrary";
import { useI18n } from "../../i18n";

export default function Media() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("settings.media.title")} subtitle={t("settings.media.subtitle")} />
      <div className="card p-5">
        <MediaLibrary mode="manage" />
      </div>
    </>
  );
}
