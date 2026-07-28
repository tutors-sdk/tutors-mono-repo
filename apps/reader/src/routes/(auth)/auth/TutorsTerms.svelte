<script lang="ts">
  import { convertMdToHtml } from "@tutors/tutors-model-lib";
  import { t } from "@tutors/i18n";
  import { sanitizeHtml } from "@tutors/ui-components/utils/sanitize";

  const content = $derived(convertMdToHtml(t("auth.terms")));
</script>

{@html sanitizeHtml(content ?? "")}
