<script lang="ts">
  import { t } from "@tutors/i18n";
  import type { InsightsRefusal } from "@tutors/insights";
  import { REFUSAL_MESSAGES } from "./format.ts";

  interface Props {
    reason: InsightsRefusal;
  }

  let { reason }: Props = $props();
</script>

<p class="ui-empty" role="status" data-reason={reason}>{t(REFUSAL_MESSAGES[reason])}</p>
